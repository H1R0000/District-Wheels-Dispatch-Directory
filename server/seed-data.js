export const seedBuyers = [
  {
    id: 'buyer-001', name: 'Maria Santos', phone: '0917 555 0142', preferredCourier: 'LBC',
    addresses: [
      { id: 'address-001', recipientName: 'Maria Santos', recipientPhone: '0917 555 0142', street: '24 Mabini Street', barangay: 'San Antonio', city: 'Makati City', province: 'Metro Manila', zipCode: '1203', isDefault: true },
    ],
    pickups: [
      { id: 'pickup-001', recipientName: 'Maria Santos', recipientPhone: '0917 555 0142', branchName: 'LBC Glorietta', branchAddress: 'Glorietta 2, Ayala Center, Makati City', isDefault: true },
    ],
  },
  {
    id: 'buyer-002', name: 'Carlo Reyes', phone: '0918 204 7316', preferredCourier: 'J&T Express',
    addresses: [
      { id: 'address-002', recipientName: 'Carlo Reyes', recipientPhone: '0918 204 7316', street: '88 Mango Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', zipCode: '6000', isDefault: true },
    ], pickups: [],
  },
  {
    id: 'buyer-003', name: 'Angela Cruz', phone: '0920 631 8824', preferredCourier: 'LBC',
    addresses: [
      { id: 'address-003', recipientName: 'Angela Cruz', recipientPhone: '0920 631 8824', street: '15 Narra Road', barangay: 'Buhangin', city: 'Davao City', province: 'Davao del Sur', zipCode: '8000', isDefault: true },
    ],
    pickups: [
      { id: 'pickup-003', recipientName: 'Angela Cruz', recipientPhone: '0920 631 8824', branchName: 'LBC SM Lanang', branchAddress: 'SM Lanang Premier, J.P. Laurel Avenue, Davao City', isDefault: true },
    ],
  },
];
