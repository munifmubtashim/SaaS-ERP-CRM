import { apiErrorSchema } from '@erp/shared';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorMiddleware } from '../../middleware/errorMiddleware.js';
import { parseInput, zodIssuesToFields } from '../../middleware/validate.js';

/**
 * A shared schema puts its stable code in the issue's `params.code` (the way #47 and #115 do), because a Zod
 * refine always reports `code: 'custom'`. That stable code is what the client maps to a message.
 */
const probeSchema = z
  .object({
    amount: z.string().refine((s) => s !== '0.00', {
      message: 'The amount must be above zero',
      params: { code: 'probe.amount_invalid' },
    }),
    qty: z.number().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.amount === '13.00') {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Unlucky',
        params: { code: 'probe.unlucky' },
      });
    }
  });

function probeApp(handler: RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { id: string }).id = 'req-test-1';
    next();
  });
  app.post('/probe', handler);
  app.use(errorMiddleware);
  return app;
}

const codesByPath = (fields: { path: string; code: string }[]) =>
  Object.fromEntries(fields.map((f) => [f.path, f.code]));

describe("a schema's stable code reaches the response's fields[]", () => {
  it('through parseInput: the refine code, next to a built-in Zod code', async () => {
    const app = probeApp((req, res) => {
      res.json(parseInput(probeSchema, req.body));
    });
    const res = await request(app).post('/probe').send({ amount: '0.00', qty: -1 });
    expect(res.status).toBe(400);
    const err = apiErrorSchema.parse(res.body);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(codesByPath(err.fields)).toEqual({ amount: 'probe.amount_invalid', qty: 'too_small' });
  });

  it('through a superRefine issue', async () => {
    const app = probeApp((req, res) => {
      res.json(parseInput(probeSchema, req.body));
    });
    const res = await request(app).post('/probe').send({ amount: '13.00', qty: 1 });
    expect(apiErrorSchema.parse(res.body).fields).toEqual([
      { path: 'amount', code: 'probe.unlucky', message: 'Unlucky' },
    ]);
  });

  it('through a ZodError that reaches errorMiddleware directly', async () => {
    const app = probeApp((req, res) => {
      res.json(probeSchema.parse(req.body));
    });
    const res = await request(app).post('/probe').send({ amount: '0.00', qty: 2 });
    expect(res.status).toBe(400);
    expect(codesByPath(apiErrorSchema.parse(res.body).fields)).toEqual({ amount: 'probe.amount_invalid' });
  });
});

describe('zodIssuesToFields falls back to the Zod code', () => {
  it('when a refine sets no params.code', () => {
    const result = z
      .string()
      .refine(() => false, 'No')
      .safeParse('x');
    expect(result.success).toBe(false);
    if (!result.success)
      expect(zodIssuesToFields(result.error)).toEqual([{ path: '', code: 'custom', message: 'No' }]);
  });

  it('when params.code is not a non-empty string', () => {
    for (const code of [42, '', null]) {
      const result = z
        .string()
        .refine(() => false, { message: 'No', params: { code } })
        .safeParse('x');
      if (result.success) throw new Error('expected a refusal');
      expect(zodIssuesToFields(result.error)[0]?.code).toBe('custom');
    }
  });
});
