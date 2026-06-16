const itemRows = [
  { id: 1325, quantity: 2, received_quantity: '0' },
  { id: 1326, quantity: 1, received_quantity: '0' }
];

const isComplete = itemRows.length > 0 && itemRows.every(item => parseFloat(item.received_quantity) >= parseFloat(item.quantity));
console.log('isComplete:', isComplete);
