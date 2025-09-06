# Purchase Order PDF Separation Task

## Completed Tasks ✅
- [x] Updated file count display in table to show actual number of files
- [x] Modified `viewQuotations` function to handle `quotation_file` as an array
- [x] Added numbering starting from 1 for each file in the view modal
- [x] Updated preview functionality to work with individual files from the array

## Summary of Changes
- **views/Purchase.ejs**: 
  - Updated file count display to show `${order.quotation_file.length} file(s)` instead of hardcoded "1 file"
  - Modified `viewQuotations` function to loop through the array and create separate items for each file
  - Added numbering with `${index + 1}.` for each file
  - Each file now has its own preview button

## Next Steps
- Test the changes to ensure multiple files are displayed correctly
- Verify that the preview functionality works for each individual file
- Check that the file count updates properly in the table

## Files Modified
- views/Purchase.ejs
