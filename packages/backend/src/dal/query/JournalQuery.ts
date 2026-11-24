import { BaseQuery } from './BaseQuery.js';

/** A journal to insert (ADR 0013). Money as strings; never a float. */
export interface JournalInsert {
  branchId: string;
  number: string;
  /** "YYYY-MM-DD"; null takes today in Asia/Dhaka by the database clock. */
  date: string | null;
  sourceType: string;
  sourceId: string;
  memo: string;
  reversalOf: string | null;
}

export interface JournalLineInsert {
  accountId: string;
  debit: string;
  credit: string;
  partyId: string | null;
}

/**
 * The accounting core's database access for posting (ADR 0013, item 2b). Satisfies businessLogic's
 * contracts/IJournalQuery. Runs inside the request's tenant transaction and never opens one (invariant 4); the
 * database checks balance, one side per line, the mirror and immutability again at commit (sql/triggers/journal.sql).
 */
export class JournalQuery extends BaseQuery {
  async roleAccounts(roles: readonly string[]): Promise<{ role: string; accountId: string }[]> {
    return this.db.$queryRaw<{ role: string; accountId: string }[]>`
      SELECT role, account_id::text AS "accountId" FROM account_role
       WHERE role = ANY (${[...roles]}::text[]) ORDER BY role FOR SHARE`;
  }

  async insertJournal(row: JournalInsert): Promise<string | null> {
    await this.requireOneBusiness('A journal');
    const [inserted] = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo, reversal_of)
      VALUES ((SELECT app_business_ids())[1], ${row.branchId}::uuid, ${row.number},
              coalesce(${row.date}::date, (now() AT TIME ZONE 'Asia/Dhaka')::date),
              ${row.sourceType}, ${row.sourceId}::uuid, ${row.memo}, ${row.reversalOf}::uuid)
      ON CONFLICT DO NOTHING
      RETURNING id::text`;
    return inserted?.id ?? null;
  }

  async isPosted(sourceType: string, sourceId: string): Promise<boolean> {
    const [row] = await this.db.$queryRaw<{ posted: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM journal
                      WHERE source_type = ${sourceType} AND source_id = ${sourceId}::uuid) AS posted`;
    return row?.posted ?? false;
  }

  async insertLines(journalId: string, lines: JournalLineInsert[]): Promise<void> {
    for (const [index, line] of lines.entries()) {
      await this.db.$executeRaw`
        INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit, party_id)
        VALUES ((SELECT app_business_ids())[1], ${journalId}::uuid, ${index + 1}, ${line.accountId}::uuid,
                ${line.debit}::numeric(18,2), ${line.credit}::numeric(18,2), ${line.partyId}::uuid)`;
    }
  }

  async findJournal(
    journalId: string,
  ): Promise<{ id: string; branchId: string; reversalOf: string | null } | null> {
    const [row] = await this.db.$queryRaw<{ id: string; branchId: string; reversalOf: string | null }[]>`
      SELECT id::text, branch_id::text AS "branchId", reversal_of::text AS "reversalOf" FROM journal
       WHERE id = ${journalId}::uuid`;
    return row ?? null;
  }

  async insertMirrorLines(reversalId: string, originalId: string): Promise<void> {
    await this.db.$executeRaw`
      INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit, party_id)
      SELECT business_id, ${reversalId}::uuid, line_no, account_id, credit, debit, party_id
        FROM journal_line WHERE journal_id = ${originalId}::uuid`;
  }
}
