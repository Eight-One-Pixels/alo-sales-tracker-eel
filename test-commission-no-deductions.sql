-- Test commission calculation with no deductions configured
-- This should work even when no deductions exist in the system

SELECT * FROM calculate_commission_with_deductions(
    1000.00,  -- revenue_amount
    10.00,    -- commission_rate (10%)
    'USD'     -- currency
);

-- Expected result when no deductions exist:
-- commissionable_amount: 1000.00
-- total_deductions: 0.00
-- final_commission: 100.00 (10% of 1000)
-- deductions_applied: []

-- This test verifies that the function handles the case where no deductions
-- have been configured by administrators without throwing errors.
