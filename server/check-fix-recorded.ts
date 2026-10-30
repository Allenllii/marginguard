import type { CheckFixContext, CheckFixResponse } from '../shared/check-fix.js';

// Recorded live runs of "Check any fix", copied verbatim from the response bodies in
// evidence/check-fix-eval-20261030.json (tests assert byte identity). Replayed offline only.
export interface RecordedCheck { id: string; fix: string; context: CheckFixContext; recordedOn: string; evalRun: string; response: CheckFixResponse; }
export const RECORDED_CHECKS: RecordedCheck[] = [
  {
    "id": "shopify-pos-stacking",
    "fix": "Tighten discount combination settings to stop staff POS discounts stacking",
    "context": {
      "platform": "Shopify",
      "carrier": "USPS",
      "region": "US"
    },
    "recordedOn": "2026-10-30",
    "evalRun": "run2",
    "response": {
      "status": "contradicted",
      "mode": "live",
      "label": "Live Tavily Search + Extract and Nemotron plan + judge, 2026-10-30.",
      "claim": "Shopify allows staff POS discounts to stack with other discount types unless combination settings are adjusted.",
      "topic": "discounts",
      "query": "how to prevent discount stacking on Shopify POS",
      "domain": "help.shopify.com",
      "sources": [
        {
          "id": "S1",
          "title": "Shopify Help Center | Combining discounts",
          "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
          "passage": "Multiple discounts are applied to an order only when the setting on each discount allows the combination. The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order: Custom discounts that are manually applied to an order. For example, a custom discount applied to a POS cart, or a custom discount on a draft order. The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order: Discounts added to an order using the Scripts API. If the Combinations section in your discount settings doesn't display options to combine product discounts with order discounts, or order discounts with other order discounts, then verify your store meets the following requirements: Confirm the discount type: Not all discount types support all combinations. For example, Buy X get Y discounts have additional limitations when combined with other product discounts."
        },
        {
          "id": "S2",
          "title": "Shopify Help Center | Discounts in Shopify POS",
          "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management",
          "passage": "You can apply custom discounts to line items or to the whole cart in Shopify POS. If you have set up automatic discounts and discount codes in your Shopify admin, then you can add and combine these discounts in the Shopify POS checkout. You need to make sure that your discounts can be combined. You can apply discounts in Shopify POS using an app built with Discount Functions."
        }
      ],
      "quotes": [
        {
          "sourceId": "S1",
          "quote": "Multiple discounts are applied to an order only when the setting on each discount allows the combination."
        },
        {
          "sourceId": "S1",
          "quote": "Custom discounts that are manually applied to an order. For example, a custom discount applied to a POS cart, or a custom discount on a draft order. The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order:"
        }
      ],
      "explanation": "The passages state that custom or manual discounts always apply regardless of combination settings, meaning they will stack even if those settings are not adjusted. Therefore tightening combination settings will not stop staff POS discounts from stacking with other discounts.",
      "nextCheck": "Look in the Shopify admin under Discounts to see the combine discounts options and try adding a staff POS discount together with another discount to observe whether both are applied.",
      "holdReason": null,
      "retrieval": {
        "steps": [
          {
            "op": "search",
            "ok": true,
            "latencyMs": 2065,
            "requestId": "24d5f33b-9052-413e-8b93-3af4b23a9e22",
            "credits": 2
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
            "ok": true,
            "latencyMs": 145,
            "credits": 1,
            "requestId": "ecc3beea-bf9c-47d1-a310-1a790300d3a1"
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management",
            "ok": true,
            "requestId": "ecc3beea-bf9c-47d1-a310-1a790300d3a1"
          }
        ]
      },
      "models": {
        "plan": "nvidia/Nemotron-3_5-Lightning",
        "judge": "nvidia/nemotron-3-super-120b-a12b"
      },
      "proof": {
        "planRequestId": "a9e3d51e58c12f2f3c9c00d2d115c004",
        "judgeRequestId": "bc85bcb7d966265da6c8376c609eb360",
        "inputTokens": 994,
        "outputTokens": 1224,
        "latencyMs": 8424
      }
    }
  },
  {
    "id": "shopify-minimum-purchase",
    "fix": "Require a minimum purchase amount on our free shipping discount code",
    "context": {
      "platform": "Shopify",
      "carrier": "USPS",
      "region": "US"
    },
    "recordedOn": "2026-10-30",
    "evalRun": "run2",
    "response": {
      "status": "supported",
      "mode": "live",
      "label": "Live Tavily Search + Extract and Nemotron plan + judge, 2026-10-30.",
      "claim": "Shopify lets a store owner set a minimum order amount requirement for free shipping discount codes.",
      "topic": "discounts",
      "query": "how to set minimum order amount for free shipping discount code shopify",
      "domain": "help.shopify.com",
      "sources": [
        {
          "id": "S1",
          "title": "Shopify Help Center | Free shipping discounts",
          "url": "https://help.shopify.com/en/manual/discounts/discount-types/free-shipping",
          "passage": "You can set a minimum purchase amount when you create a free shipping discount. All products that are in a customer's cart count towards the minimum purchase amount for free shipping discounts, including any gift cards that the customer buys. A discount that can't be combined with your free shipping discount never applies at the same time, so it never changes the minimum purchase amount. Optional: In the Minimum requirements section, select Minimum purchase amount or Minimum quantity of items, and then enter the dollar value or number of items that need to be added before the discount code applies."
        },
        {
          "id": "S2",
          "title": "Shopify Help Center | Setting up shipping zones and rates",
          "url": "https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/setting-up-shipping-rates",
          "passage": "You can charge a fixed amount, offer free shipping, or vary the price based on order value or weight. This helps you charge your customers the exact amount that a shipping carrier charges you when you purchase a shipping label. You need to enter a minimum amount for an order to qualify for free shipping. Select Offer free shipping, and then enter the minimum amount for an order to qualify for free shipping."
        },
        {
          "id": "S3",
          "title": "Shopify Help Center | Custom discounts for orders",
          "url": "https://help.shopify.com/en/manual/checkout-settings/checkout-blocks/custom-discounts/order-discount",
          "passage": "Optional: You can configure the following options: Minimum purchase requirements, to require that customers spend a minimum purchase amount to qualify for the discount. Combinations, to allow customers to combine the discount code with order, product, or shipping discounts. In the Amount off order section, select one of the following options: Discount code, and then add your discount code. Start for free Log in # Custom discounts for orders You can set up custom order discounts to determine the amount of discount to apply in the following ways: Percentage discount: Reduces order total by the percentage specified."
        }
      ],
      "quotes": [
        {
          "sourceId": "S1",
          "quote": "You can set a minimum purchase amount when you create a free shipping discount."
        },
        {
          "sourceId": "S2",
          "quote": "You need to enter a minimum amount for an order to qualify for free shipping. Select Offer free shipping, and then enter the minimum amount for an order to qualify for free shipping."
        },
        {
          "sourceId": "S3",
          "quote": "Minimum purchase requirements, to require that customers spend a minimum purchase amount to qualify for the discount."
        }
      ],
      "explanation": "The policy confirms that store owners can set a minimum purchase amount when creating a free shipping discount. It shows the option exists in both the discount creation flow and the shipping zone setup. Therefore the claim that Shopify allows this requirement is accurate.",
      "nextCheck": "In your Shopify admin go to Discounts create or edit a free shipping code and look for the Minimum purchase amount field. Seeing this field confirms you can apply the fix.",
      "holdReason": null,
      "retrieval": {
        "steps": [
          {
            "op": "search",
            "ok": true,
            "latencyMs": 2460,
            "requestId": "fc51772f-bd8a-4263-abf8-adc0bc639f49",
            "credits": 2
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/discounts/discount-types/free-shipping",
            "ok": true,
            "latencyMs": 122,
            "credits": 0,
            "requestId": "ce5c4440-49a5-480d-b0dd-b05a9fbef90b"
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/setting-up-shipping-rates",
            "ok": true,
            "requestId": "ce5c4440-49a5-480d-b0dd-b05a9fbef90b"
          }
        ]
      },
      "models": {
        "plan": "nvidia/Nemotron-3_5-Lightning",
        "judge": "nvidia/nemotron-3-super-120b-a12b"
      },
      "proof": {
        "planRequestId": "29b5bf51e002ce6935db373afeeef25c",
        "judgeRequestId": "9d04b720e73122088d3751a5c5156c2d",
        "inputTokens": 1066,
        "outputTokens": 1288,
        "latencyMs": 58609
      }
    }
  },
  {
    "id": "woo-individual-use",
    "fix": "Turn on individual use only so coupons cannot be combined with other coupons",
    "context": {
      "platform": "WooCommerce",
      "carrier": "USPS",
      "region": "US"
    },
    "recordedOn": "2026-10-30",
    "evalRun": "run1",
    "response": {
      "status": "supported",
      "mode": "live",
      "label": "Live Tavily Search + Extract and Nemotron plan + judge, 2026-10-30.",
      "claim": "WooCommerce allows store owners to set coupon restrictions that prevent multiple coupons from being applied to a single order.",
      "topic": "discounts",
      "query": "WooCommerce coupon restrictions prevent combining multiple coupons",
      "domain": "woocommerce.com",
      "sources": [
        {
          "id": "S1",
          "title": "How to stack or combine coupons Documentation - WooCommerce",
          "url": "https://woocommerce.com/document/smart-coupons/how-to-stack-or-combine-coupons",
          "passage": "WooCommerce only allows one coupon per order by default. This doc covers how to let specific coupons be used together in the same order, or block certain coupons from being combined. Smart Coupons adds a “Smart Coupons Restrictions” field to each coupon’s usage restrictions, where you control exactly which coupons it can or cannot be combined with. Look for the field “Smart Coupons Restrictions”."
        },
        {
          "id": "S2",
          "title": "How to prevent users from applying multiple coupons",
          "url": "https://woocommerce.com/document/smart-coupons/how-to-prevent-users-from-applying-multiple-coupons",
          "passage": "Smart Coupons provide a powerful, “all-in-one” solution for gift cards, store credits, discount coupons, and vouchers, extending the core functionality of WooCommerce coupons. This doc explains how to not allow coupons to be used with other coupons. WooCommerce Subscriptions is a WooCommerce extension that lets customers subscribe to your products or... Define multiple shipping rates based on location, price, weight, shipping class..."
        },
        {
          "id": "S3",
          "title": "Managing Coupons in WooCommerce Documentation - WooCommerce",
          "url": "https://woocommerce.com/document/coupon-management",
          "passage": "If WooCommerce rejects the combination, lower the minimum or raise the maximum, then save the coupon again. Other restrictions, such as categories, brands, sale items, spend limits, and allowed emails, still apply. ### Configuring Coupon Usage Limits ↑ Back to top Maximum spend — Set the maximum subtotal allowed when using the coupon. Individual use only — Select the checkbox if the coupon cannot be used in combination with other coupons."
        }
      ],
      "quotes": [
        {
          "sourceId": "S1",
          "quote": "WooCommerce only allows one coupon per order by default."
        },
        {
          "sourceId": "S3",
          "quote": "Individual use only - Select the checkbox if the coupon cannot be used in combination with other coupons."
        }
      ],
      "explanation": "The documentation shows a checkbox labeled Individual use only that stops a coupon from being used together with another coupon. This setting is found in the coupon editing screen under usage restrictions.",
      "nextCheck": "In the WooCommerce admin go to Coupons edit a coupon and verify the Individual use only box can be checked.",
      "holdReason": null,
      "retrieval": {
        "steps": [
          {
            "op": "search",
            "ok": true,
            "latencyMs": 3428,
            "requestId": "cc1071b4-7796-4749-b04e-43d3f43fe5f2",
            "credits": 2
          },
          {
            "op": "extract",
            "url": "https://woocommerce.com/document/smart-coupons/how-to-stack-or-combine-coupons",
            "ok": true,
            "latencyMs": 923,
            "credits": 0,
            "requestId": "66e77705-3069-4ff5-bdac-0fb8efc47d45"
          },
          {
            "op": "extract",
            "url": "https://woocommerce.com/document/smart-coupons/how-to-prevent-users-from-applying-multiple-coupons",
            "ok": true,
            "requestId": "66e77705-3069-4ff5-bdac-0fb8efc47d45"
          }
        ]
      },
      "models": {
        "plan": "nvidia/Nemotron-3_5-Lightning",
        "judge": "nvidia/nemotron-3-super-120b-a12b"
      },
      "proof": {
        "planRequestId": "0bdb8dbad72b0deecff13699bcb75a59",
        "judgeRequestId": "6bedd9d869cd9ec190a0b8514d329232",
        "inputTokens": 978,
        "outputTokens": 1466,
        "latencyMs": 13503
      }
    }
  },
  {
    "id": "shopify-return-window",
    "fix": "Shorten the return window from 30 to 14 days",
    "context": {
      "platform": "Shopify",
      "carrier": "USPS",
      "region": "US"
    },
    "recordedOn": "2026-10-30",
    "evalRun": "run1",
    "response": {
      "status": "supported",
      "mode": "live",
      "label": "Live Tavily Search + Extract and Nemotron plan + judge, 2026-10-30.",
      "claim": "Shopify's return policy settings allow merchants to set a custom return window for orders fulfilled by the merchant.",
      "topic": "returns",
      "query": "how to set return window duration in Shopify admin",
      "domain": "help.shopify.com",
      "sources": [
        {
          "id": "S1",
          "title": "Shopify Help Center | Setting up return and cancellation rules",
          "url": "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/return-rules",
          "passage": "To allow customers to request returns or cancellations, you need to turn on self-serve returns and cancellations in your online store. Return rules apply to fulfilled items, and determine when customers can request a return. The return window information comes from the settings that you configure in the Policies section of your Shopify admin. For example, for customers in the European Union you might set the cancellation window to Until item is fulfilled and a return window of at least 14 days to support the EU right of withdrawal, and apply a shorter standard return window elsewhere."
        },
        {
          "id": "S2",
          "title": "Shopify Help Center | Return rules",
          "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/return-rules",
          "passage": "You can manage your return rules in Settings > Policies section of your Shopify admin. For example, a frequent customer requests a return or a customer requests a return one day after the return window ends. You need to have return rules set up in your Shopify admin. The return window is the amount of time the customer has to return a product after purchase."
        },
        {
          "id": "S3",
          "title": "Shopify Help Center | Setting up self-serve returns and cancellations",
          "url": "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/self-serve-returns/setup",
          "passage": "## Activate self-serve returns and cancellations To set up return and cancellation requests, you need to activate self-serve returns and cancellations in your Shopify admin. To do that, you can set up customer accounts in your Shopify admin or add the customer accounts URL to your store. #### Steps: 1. From your Shopify admin, go to Settings > Customer accounts. Activate self-serve returns and cancellations in your Shopify admin Give customers access to sign in to customer accounts using one of the following methods: + Upgrade to customer accounts. + Add the URL for customer accounts to your store's footer, refund policy, or another page in your store."
        }
      ],
      "quotes": [
        {
          "sourceId": "S1",
          "quote": "The return window information comes from the settings that you configure in the Policies section of your Shopify admin."
        },
        {
          "sourceId": "S2",
          "quote": "You can manage your return rules in Settings > Policies section of your Shopify admin."
        }
      ],
      "explanation": "The quoted text shows that return windows are defined in the Policies settings where merchants can adjust the length. Because the setting exists, a merchant can change the window to a different length if desired.",
      "nextCheck": "In your Shopify admin, go to Settings > Policies and look for the return window field to see if it can be edited to another length. If the field is present and editable, you can proceed with the change.",
      "holdReason": null,
      "retrieval": {
        "steps": [
          {
            "op": "search",
            "ok": true,
            "latencyMs": 2910,
            "requestId": "2fafe575-07c1-4cd8-8241-c0c4c6e4169e",
            "credits": 2
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/return-rules",
            "ok": true,
            "latencyMs": 121,
            "credits": 1,
            "requestId": "09670671-13f9-41e1-b24a-b8ee44717b44"
          },
          {
            "op": "extract",
            "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/return-rules",
            "ok": true,
            "requestId": "09670671-13f9-41e1-b24a-b8ee44717b44"
          }
        ]
      },
      "models": {
        "plan": "nvidia/Nemotron-3_5-Lightning",
        "judge": "nvidia/nemotron-3-super-120b-a12b"
      },
      "proof": {
        "planRequestId": "14cb06fed00605c3ed68bc4faf4195c1",
        "judgeRequestId": "b01c57bdfe8d1981bd953da0ea151e32",
        "inputTokens": 1036,
        "outputTokens": 1332,
        "latencyMs": 15876
      }
    }
  }
];
