# Procurement Form Fixes

## Frontend Fixes (procurement.ejs)
- [ ] Add unit select dropdown to initial product row
- [ ] Fix HTML structure for discount input (add missing closing </td>)
- [ ] Fix getProductData function to get unit.value instead of textContent

## Backend Fixes (index.js)
- [ ] Change unit handling from parseFloat to string in /order_raise route

## Testing
- [ ] Test form submission after fixes
- [ ] Verify unit is properly saved and visible
