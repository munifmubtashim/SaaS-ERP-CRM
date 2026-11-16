import type { MessageKey } from './en.js';

/**
 * Bangla catalogue. Draft wording: have a native speaker on the shop floor review before Phase 1 ships.
 * Same keys as en, enforced by the type below and by catalogue.test.ts.
 */
export const bn: Record<MessageKey, string> = {
  'app.name': 'ইআরপি',
  'shell.nav.home': 'হোম',
  'shell.nav.businesses': 'ব্যবসা',
  'shell.nav.sales': 'বিক্রয় / পিওএস',
  'shell.nav.inventory': 'ইনভেন্টরি',
  'shell.nav.customers': 'গ্রাহক',
  'shell.nav.accounting': 'হিসাব',
  'shell.nav.reports': 'রিপোর্ট',
  'shell.nav.users': 'ব্যবহারকারী ও অনুমতি',
  'shell.language': 'ভাষা',
  'shell.theme.light': 'লাইট',
  'shell.theme.dark': 'ডার্ক',
  'shell.sidebar.collapse': 'সাইডবার ছোট করুন',
  'shell.sidebar.expand': 'সাইডবার বড় করুন',
  'scope.business': 'ব্যবসা',
  'scope.branch': 'শাখা',
  'scope.loading': 'ব্যবসার তালিকা আসছে…',
  'scope.error': 'আপনার ব্যবসার তালিকা আনা যায়নি।',
  'scope.retry': 'আবার চেষ্টা করুন',
  'scope.none': 'আপনাকে এখনো কোনো ব্যবসা দেওয়া হয়নি।',
  'home.title': 'সিস্টেমের অবস্থা',
  'home.subtitle': 'ধাপ ০: অ্যাপ এপিআই-এর সাথে কথা বলে, আর এপিআই ডেটাবেসের সাথে।',
  'health.api': 'এপিআই',
  'health.database': 'ডেটাবেস',
  'health.ok': 'চালু আছে',
  'health.down': 'সংযোগ নেই',
  'health.loading': 'যাচাই করা হচ্ছে…',
  'health.error': 'এপিআই-এ পৌঁছানো যায়নি। `npm run dev` চালু আছে কি?',
  'health.retry': 'আবার চেষ্টা করুন',
  'health.version': 'সংস্করণ',
  'health.checkedAt': 'যাচাইয়ের সময়',
  'page.notBuilt': 'এই মডিউলটি এখনও তৈরি হয়নি। পরের ধাপে আসবে।',
  'error.title': 'কিছু একটা সমস্যা হয়েছে',
  'error.home': 'হোমে ফিরে যান',
};
