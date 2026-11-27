# n8n integration contract

The website sends one webhook to n8n when a customer places an order. n8n
checks stock in Supabase and updates the order status. Point your existing
n8n nodes at the tables and columns below.

## Webhook

- **Method:** `POST`
- **Content-Type:** `application/json`
- **URL:** the value of `N8N_WEBHOOK_URL` in your `.env.local` (and Vercel env vars)
- **Sent from:** the `createOrder` server action in `lib/actions/orders.ts`
- **Best-effort:** the order is saved as `pending` first; if n8n is unreachable
  the order stays `pending` and the customer is still shown a confirmation.

## Payload sent by the website

```json
{
  "order_id": "uuid",
  "created_at": "2026-11-18T12:00:00.000Z",
  "customer": {
    "name": "Customer name",
    "email": "customer@example.com",
    "phone": "+92 ...",
    "alternate_phone": "",
    "address": "Street, area",
    "city": "Karachi"
  },
  "items": [
    {
      "product_id": "uuid",
      "variant_id": "uuid or null",
      "title": "Heavyweight Hoodie",
      "variant_label": "M / Black",
      "color": "Black",
      "size": "M",
      "price": 4500,
      "quantity": 2
    }
  ],
  "subtotal": 9000,
  "delivery_fee": 250,
  "total": 9250
}
```

Notes:
- `variant_id` is `null` for simple products (those with `has_variants = false`
  in the `products` table). For those, read stock from `products.stock`.
- For variant products, `variant_id` is set; read stock from `variants.stock`.
- `price` is informational; the source of truth for stock is the `stock` column.
- `color` and `size` are additive informational fields (empty string when not
  applicable). Existing nodes that only read the original keys keep working.

## What n8n should do

### Stock check
For each item in `items`:
- If `variant_id` is not null: read `variants.stock` where `id = variant_id`.
- Else: read `products.stock` where `id = product_id`.
- The order is in stock only when every item has `stock >= quantity`.

### True branch (in stock)
1. **Update rows** to deduct stock:
   - `variants`: `stock = stock - quantity` where `id = variant_id` (for variant items)
   - `products`: `stock = stock - quantity` where `id = product_id` (for simple items)
2. **Update the order status:** `orders.status = 'confirmed'` where `id = order_id`.
3. **Send email** to `customer.email` confirming the order.
4. **HTTP request** to your Discord webhook (owner notification).
5. **Append a row** to your Google Sheet.
6. **Separate flow from true: insert a row** into `order_audit`
   (`order_id`, `event = 'confirmed'`, `payload = <json>`).

### False branch (out of stock)
1. **Update the order status:** `orders.status = 'out_of_stock'` where `id = order_id`.
2. **Send email** to `customer.email` explaining the item is out of stock.
3. **Owner notification** (Discord / email).

## Status values (orders.status enum)

`pending`, `confirmed`, `out_of_stock`, `shipped`, `delivered`, `cancelled`

n8n only sets `confirmed` and `out_of_stock`. The store owner manages
`shipped`, `delivered`, and `cancelled` from the admin panel, and can revert
`out_of_stock` back to `pending` after restocking.

## Tables and key columns

| Table | Key columns |
| --- | --- |
| `products` | `id`, `stock` (simple products), `has_variants` |
| `variants` | `id`, `product_id`, `stock` |
| `orders` | `id`, `status`, `email`, `customer_name`, `total` |
| `order_audit` | `id`, `order_id`, `event`, `payload`, `created_at` |

The full schema is in `supabase/migrations/0001_init.sql`.
