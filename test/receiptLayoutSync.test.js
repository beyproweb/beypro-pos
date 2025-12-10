// test/receiptLayoutSync.test.js
// Test to verify that receipt customizations are applied after settings change

import { setReceiptLayout, getReceiptLayout } from '../src/utils/receiptPrinter';

const TEST_LAYOUT = {
  headerTitle: 'TEST HEADER',
  footerText: 'TEST FOOTER',
  showHeader: true,
  showFooter: true,
  logoUrl: 'https://example.com/test-logo.png',
  alignment: 'right',
};

describe('Receipt Layout Sync', () => {
  it('should apply new layout after setReceiptLayout', () => {
    setReceiptLayout(TEST_LAYOUT);
    const layout = getReceiptLayout();
    expect(layout.headerTitle).toBe('TEST HEADER');
    expect(layout.footerText).toBe('TEST FOOTER');
    expect(layout.logoUrl).toBe('https://example.com/test-logo.png');
    expect(layout.alignment).toBe('right');
    expect(layout.showHeader).toBe(true);
    expect(layout.showFooter).toBe(true);
  });
});
