# Yamaha Multi-Business ERP: Pages and Features


## Features on every page

- **Search by part:** the user selects a part (for example Inventory, Customers, Sales, Purchase, Service, Accounting) and searches only inside it. A search can also run across all parts.
- **Filters:** every list filters by business, branch, date range and the key fields of that page.
- **Activity record:** every create, edit, delete, void, approval and status change is recorded with who did it, the date and time, and the old and new values. The record shows on each item and in one Activity Log page that filters by user, page, action and date.
- **Business and branch switcher:** the active business and branch show on every page and on every printed document.
- **Notifications:** in-app, SMS or email alerts for low stock, large discount, void, cash difference and due payments.
- **Export and print:** tables export to Excel and PDF; documents print with the business logo and details.
- **Attachments:** photos and documents can be attached to customers, units, purchases, expenses and jobs.
- **Language and format:** Bangla and English; amounts in BDT with lakh and crore grouping; dates as day-month-year; Bangladesh phone number check.
- **Phone and tablet:** dashboard, approvals, stock count and job card work on small screens.

## Owner Dashboard and Action Center

- **Filters:** business, branch and date range apply to every card.
- **Financial Health:** revenue, net profit after expenses, margin, cash flow, receivables, payables and a cash forecast that includes rent, salaries and other regular expenses.
- **Sales Performance:** total sales, growth, target against actual, sales by branch and salesperson.
- **Inventory Health:** stock value, low stock, out of stock, overstock and reorder alerts, with showroom and warehouse quantities.
- **Business and Branch Comparison:** revenue and profit by business and by branch.
- **Customer Insights:** top customers, repeat customers and retention.
- **Operations and Procurement:** orders, suppliers, purchases, deliveries and salary cost.
- **Action Center:** pending approvals, overdue customer payments, supplier bills due, low stock, sold but not delivered, aged stock, transfer mismatch, unreconciled collection and VAT alerts. Each item shows what happened, the amount and the source document, and can be assigned with a due date and resolved. The history is kept.
- **Drill-down:** every figure opens the documents behind it.
- **Role views:** Owner, Business Manager, Branch Manager and Accountant see only their own scope.
- **Last updated time** on every card; loading, empty and error states on every widget.
- **Green, amber, red** colour rule; dark mode; phone layout.

## Organization, Businesses and Branches

- **Setup:** create, edit and deactivate a group, legal entity, business and branch with name, address, BIN, logo, invoice prefix and opening hours. A deactivated branch keeps its history but cannot transact.
- **Separate books:** each business has its own chart of accounts, fiscal year and invoice series.
- **Data isolation:** a user of one business cannot see another business's data by screen, link, export or API.
- **Branch transfer:** cash and stock move between branches; both the sending and receiving branch confirm, and unconfirmed transfers are listed.
- **Inter-business transactions:** sales or transfers between businesses are recorded on both sides with matching due-to and due-from balances.
- **Group view:** group totals with each total opening the business figures behind it.
- **Branch comparison:** sales, margin, stock, dues and expenses side by side for the same period.
- **New business template:** set up a new business with a ready chart of accounts, tax, roles and document formats.

## Sales and POS

- **Customer details:** a motorcycle sale needs customer name, phone, national ID and address. Walk-in customers are allowed for parts and accessories only.
- **Chassis selection:** only available chassis numbers show, each with engine number and colour. Reserved or sold units never appear. If two cashiers pick the same chassis, one sale succeeds and the other is refused with a clear message.
- **Payment:** split payment across cash, bank, bKash and card; any shortfall is recorded as Due. A down payment can be taken with a due date for the balance.
- **Discount control:** a discount above the set limit needs manager approval and a reason; the approver and amount are logged.
- **Invoice:** VAT on a separate line, business BIN printed, print and PDF export, and sending by SMS or messaging app.
- **Delivery:** choose deliver now or later. Later sets the status Sold, not delivered. Delivery with a balance outstanding needs manager approval.
- **Booking advance:** an advance paid at booking is deducted on the final invoice.
- **Reservation expiry:** a reservation lapses after a set period and the unit returns to Available; staff get a reminder before it lapses.
- **Credit control:** a customer with an overdue balance cannot get a new credit sale without approval. Dealer and business customers have a credit limit and BIN.
- **Instalment and bank financing:** plans or loan references with a due calendar.
- **Returns and refunds:** a return needs permission, restocks the item, issues a credit note and records the refund method.
- **Salesperson:** every sale records the salesperson for target reporting.
- **Hold sale:** save an incomplete sale and resume it later.
- **Barcode scanning** adds an item to the sale.
- **Shift and cash drawer:** open with a starting cash amount and close with reconciliation.
- **Offline:** if the connection drops, the sale is queued or a clear error shows, and no data is lost.

## Booking and Preorder

- **Booking with advance:** book a specific unit, or a model and colour, with an advance. A receipt is issued and the unit becomes Reserved.
- **Advance as liability:** the advance is held as a customer advance, not as revenue, until the invoice is issued.
- **Convert to sale:** a booking becomes an invoice with customer, unit and advance carried over.
- **Cancel, refund or forfeit:** cancelling releases the unit; the refund or forfeit follows the set policy and records a reason.
- **Booking list:** all bookings with status and hold-until date; those near expiry appear in the Action Center.
- **Amend booking:** change model, colour or unit; the change is logged and the advance is kept.
- **Preorder:** order a model that is not yet in stock; a unit is allocated on receipt and the customer is informed.
- **Waiting list:** customers queued by model and colour, offered stock in order when it arrives.
- **Quotation:** issue a quotation with a validity date and convert it to a booking or an invoice.

## Purchase and Suppliers

- **Supplier page:** supplier details, purchases, payments and balance in one place, plus a printable statement per period.
- **Purchase order:** supplier, items, quantity, price and expected date, with statuses Draft, Approved, Sent, Partially received and Closed. An order above a set amount needs approval before it is sent.
- **Goods receipt:** receive against an order, including partial receipts; a receipt above the ordered quantity is blocked or needs approval. The receipt updates stock and the supplier payable.
- **Motorcycle receipt:** chassis number, engine number, colour and cost entered or imported per unit; duplicates are rejected.
- **Supplier bill:** matched to the order and the receipt; quantity or price differences are flagged before payment.
- **Supplier payment:** full, partial and advance payments allocated to bills.
- **Payables aging and due alerts:** bills by due date and age; bills due or overdue appear in the Action Center.
- **Purchase return:** goods sent back create a debit note and reduce stock and the payable.
- **Reorder suggestion:** items at or below reorder level turn into a draft purchase order in one step.
- **Price history:** earlier purchase prices per item and supplier; a rise above a set percentage is flagged.
- **Direct purchase:** record a purchase without an order; stock, payable and accounts still update.
- **Landed cost:** freight and other costs can be added to unit or batch cost.

## Inventory

- **Stock by location:** for every item, the quantity in the showroom, the quantity in the warehouse and the total are shown side by side. A bin location can be set inside each warehouse.
- **Low stock alert:** each item has a reorder level and reorder quantity. At or below the level it shows Low, the basis for Low is visible, and an alert goes to the Action Center and to notifications. Out-of-stock items are listed separately, and a draft purchase order can be created in one step.
- **Single stock figure:** a status change shows the same in POS, Products, Inventory and the Dashboard immediately. A sale of an item with no stock is refused.
- **Unique chassis and engine numbers:** a duplicate is rejected, and the page names the record that already holds it.
- **Goods receipt:** receive stock against a purchase order and reconcile quantities and prices.
- **Transfer between showroom, warehouse and branches:** needs approval, shows In transit, is confirmed on receipt and highlights quantity differences.
- **Stock adjustment:** needs a reason and records the old quantity, new quantity and user.
- **Physical count:** count session with variance against system stock; adjustments apply on approval.
- **Damaged stock:** separate status, excluded from sellable stock, can be returned to the supplier.
- **Movement history:** every stock movement records who, when, why, and the quantity before and after.
- **Stock value:** parts at weighted average cost; motorcycles at each unit's own cost.
- **Stock aging** report.
- **Parts and model fit:** each part lists the models it fits; searching by model lists the parts.
- **Opening data import** from a spreadsheet, with rejected rows listed with reasons.
- **Export** to Excel and PDF.

## Products

- **Unit history:** a timeline for each unit from purchase to delivery, with its supplier, purchase cost and margin after sale.
- **Unit status flow:** In stock, Reserved, Sold not delivered, Delivered. A reserved unit cannot be sold to another customer.
- **Models:** add, edit and archive. An archived model cannot be sold but keeps its history.
- **Variants and specifications:** colour, model year and specifications per model.
- **Brand:** recorded per model; filters and reports can split by brand.
- **Price history:** every price change with date and user; earlier invoices keep their original prices.
- **Images and documents** attached to models and units.
- **Barcode and QR code** for units and items.
- **Warranty start:** on delivery a warranty record is created with customer, chassis, engine, delivery date and warranty period.
- **Service book:** the unit's service history and upcoming service due dates.

## Service and Warranty

- **Job card:** opened by chassis, number plate or phone, with complaint, odometer reading, advisor and technician; sequential number; print and PDF, with a delivery note.
- **Job status:** Received, In progress, Awaiting parts, Ready, Delivered; each change records user and time.
- **Warranty check:** on opening a job, the page shows whether the unit is under warranty by date and kilometres. Warranty work is not charged to the customer and its cost is recorded.
- **Parts used:** parts issued to a job reduce stock and appear on the service invoice. A part with no stock cannot be issued.
- **Service invoice:** labour and parts invoiced from the job card, accepting the same payment methods as POS.
- **Estimate and approval:** estimate of parts and labour, approved by the customer before extra work starts.
- **Free service schedule:** free services due under the sale tracked per unit and marked as used.
- **Vehicles bought elsewhere:** a vehicle and customer record can be created at the counter.
- **Supplier warranty claim:** claim status and amount reimbursed.
- **Service reminder** by date or kilometres.
- **Technician report:** jobs, time and rework per technician.

## Customers and CRM

- **Customer profile:** one page with details, vehicles, invoices, payments, dues, bookings, service jobs and notes.
- **Duplicate check and merge:** a warning for an existing phone or national ID; two records can be merged and the merge is logged.
- **Dues list and aging:** balances per customer with age and due date.
- **Collection:** receive payment against selected invoices or the oldest first, and print a money receipt.
- **Follow-up and promise to pay:** promise date, amount, collector and outcome; broken promises appear in the Action Center.
- **Customer statement** per period, printable or shareable.
- **Leads:** enquiry with source, model of interest, owner and next follow-up date; convertible to a booking.
- **SMS templates and log:** recipient, status and cost for each message.
- **Segments and campaigns:** select customers by rule, such as overdue or service due, and message them as a group.
- **Feedback and complaints** with owner and status.
- **Guarantor and relations** linked to a customer for credit sales.
- **Data protection:** national ID and documents are visible only to permitted roles, and every view is logged.

## Accounting

- **Automatic posting:** sales, goods receipts, payments, sales returns and purchase returns post to accounts without manual entry; posting rules can be changed and each change is logged.
- **Customer and supplier ledgers:** invoices, payments and balance in one place; advances held correctly.
- **Expenses:** record rent, utilities and other costs with a receipt image; an expense above a set amount needs approval. Net profit is calculated after expenses and salaries.
- **Recurring expenses:** rent and similar fixed costs can be set once with an amount and due day, so they feed the cash forecast.
- **Salaries:** salary entries made on the Reports page post here as expenses.
- **VAT:** payable and receivable tracked separately, monthly VAT summary, Mushak 6.3 tax invoice, VAT return worksheet and tax withheld at source.
- **Invoice numbers:** sequential with no gaps; a cancelled invoice is voided, never deleted, with reason and user.
- **Chart of accounts:** add, edit and deactivate; an account with entries cannot be deleted.
- **Manual journal:** accepted only when debits equal credits; needs approval; can carry an attachment.
- **Posted entries cannot be edited or deleted.** A correction is a reversal linked to the original.
- **Cash book and day close:** each branch closes the day by payment method, expected against counted; a difference needs a reason, the day locks and a closing report goes to the owner.
- **Month-end and year-end close** after a checklist; earlier entries are locked and balances carry forward.
- **Financial statements:** trial balance, profit and loss, balance sheet, cash flow, general ledger and day book per business and period.
- **Aging:** customer and supplier balances in age buckets.
- **Bank reconciliation:** match bank statement lines to transactions and list unmatched items.
- **Budgets:** set per account and branch, with actual against budget.

## Reports

- **Standard reports:** sales, purchases, stock, dues, supplier payables, expenses, profit by product, branch and salesperson, daily closing and VAT.
- **Salary entry:** a form on this page to enter each month's salary per staff member, with branch and month. Entries appear in the expense and profit reports and are visible only to permitted roles.
- **Forecast:** expected cash for the coming months, built from expected collections, supplier bills due, rent, salaries and other regular expenses, per business and branch.
- **Daily closing report:** per branch each day, with sales, collections, expenses, cash difference and exceptions.
- **Filters and comparison:** every report filters by business, branch and date range and compares with the previous period.
- **Saved views:** save a set of filters and reuse it.
- **Scheduled reports** sent by email or messaging app daily, weekly or monthly.
- **Unusual activity flags:** unusual discounts, voids, cash differences and negative margins.
- **Target report:** target against actual per salesperson and branch.
- **Reports agree with the ledger** for the same period.
- **Hidden figures:** cost, profit and salary figures show only to permitted roles, in reports and in exports.
- **Export** to Excel and PDF.

## Users and Roles

- **Users:** invite, edit and deactivate; a deactivated user keeps their history.
- **Roles:** Owner, Business Manager, Branch Manager, Accountant and Cashier, each granted for the whole group, one business or one branch. Custom roles can be built from the permission list.
- **Hidden fields:** cost price, profit and salary are hidden from roles without permission, on screen, in exports and in the API.
- **Approval rule:** a user cannot approve a request they created.
- **Login security:** passwords stored hashed, account locks after repeated failures, password reset links work once and expire.
- **Two-factor sign-in:** available to all and required for Owner and Accountant.
- **Sessions:** see active sessions, sign out other devices; idle sessions expire.
- **Login history:** time and device for each login, with an alert on a new device.
- **Permission change log:** every change to a role, permission or user scope with who and when.
- **Staff without login:** technicians and others can exist as records and be assigned work.
