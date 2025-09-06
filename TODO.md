# TODO: Add Rejected Orders Tab to MD Section

- [x] Add "Rejected Orders" tab button to views/Md.ejs
- [x] Create rejected orders table structure in views/Md.ejs
- [x] Add loadRejectedOrders() JavaScript function to views/Md.ejs
- [x] Update loadRejectedOrders() to use correct API endpoint (/api/orders/search/filter?status=rejected)
- [x] Add CSS styling for .status-rejected badge in views/Md.ejs
- [x] Verify backend API supports 'rejected' status (confirmed: /api/orders/:id/approve supports 'rejected' status)
- [x] Verify backend API supports filtering by 'rejected' status (confirmed: /api/orders/search/filter supports status=rejected)
