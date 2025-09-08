# TODO: Modify PDF Generation to Fetch Requester Name from Users Table

## Tasks
- [ ] Modify /api/orders/:id/pdf route in index.js to query users table for name where email matches order.ordered_by
- [ ] Update poData.requester.name to use fetched name, with fallback to email if not found
- [ ] Test PDF generation to verify name displays correctly
