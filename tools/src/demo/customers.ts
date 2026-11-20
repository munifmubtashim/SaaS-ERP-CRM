import type { DemoCustomer } from './types.ts';

/**
 * 30 invented customers. Names are made-up combinations, not real people; phones are in the fake
 * +88017000000NN range; no NID (it is never seeded, ADR 0001 row 2). Bangla names on every other customer.
 */
const NAMES: [string, string | null, string][] = [
  ['Rahim Traders', 'রহিম ট্রেডার্স', 'Mirpur'],
  ['Karim Auto Centre', null, 'Mirpur'],
  ['Nasrin Enterprise', 'নাসরিন এন্টারপ্রাইজ', 'Pallabi'],
  ['Sadia Rahman', null, 'Uttara'],
  ['Tanvir Ahmed', 'তানভীর আহমেদ', 'Uttara'],
  ['Mizanur Rahman', null, 'Tongi'],
  ['Farzana Akter', 'ফারজানা আক্তার', 'Agrabad'],
  ['Habib Hossain', null, 'Halishahar'],
  ['Rupa Begum', 'রুপা বেগম', 'Narayanganj'],
  ['Shafiq Motors Repair', null, 'Fatullah'],
  ['Jamal Uddin', 'জামাল উদ্দিন', 'Mirpur'],
  ['Laila Sultana', null, 'Kafrul'],
  ['Arif Hasan', 'আরিফ হাসান', 'Uttara'],
  ['Moni Store', null, 'Airport Road'],
  ['Selim Reza', 'সেলিম রেজা', 'Agrabad'],
  ['Parvin Nahar', null, 'Pahartali'],
  ['Kamal Bhuiyan', 'কামাল ভূঁইয়া', 'Narayanganj'],
  ['Bari Parts House', null, 'Chashara'],
  ['Nusrat Jahan', 'নুসরাত জাহান', 'Mirpur'],
  ['Rakib Chowdhury', null, 'Agrabad'],
  ['Shirin Akter', 'শিরিন আক্তার', 'Uttara'],
  ['Delwar Hossain', null, 'Mirpur'],
  ['Sumaiya Islam', 'সুমাইয়া ইসলাম', 'Narayanganj'],
  ['Anwar Courier Service', null, 'Uttara'],
  ['Mitu Rani', 'মিতু রানী', 'Agrabad'],
  ['Hasib Khan', null, 'Mirpur'],
  ['Shahana Parvin', 'শাহানা পারভীন', 'Uttara'],
  ['Robiul Islam', null, 'Fatullah'],
  ['Taslima Khatun', 'তাসলিমা খাতুন', 'Mirpur'],
  ['Zahid Delivery', null, 'Agrabad'],
];

export const DEMO_CUSTOMERS: readonly DemoCustomer[] = NAMES.map(([name, nameBn, area], i) => {
  const n = String(i + 1).padStart(2, '0');
  return { code: `C-00${n}`, name, nameBn, phone: `+88017000000${n}`, area };
});
