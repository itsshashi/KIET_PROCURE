# TODO for Adding 'unit' field to Purchase Order Items

- [x] Update database schema to add 'unit' column to purchase_order_items table if missing.
- [x] Update backend order insertion query to include 'unit' field.
- [x] Update frontend order form to include 'unit' dropdown for each product row.
- [x] Update frontend JavaScript to collect 'unit' value and send with order submission.
- [ ] Test order creation with unit field included.
- [ ] Verify data saved correctly in database.
- [ ] Verify order display and reports handle 'unit' field correctly.
- [ ] Deploy changes and monitor for issues.
