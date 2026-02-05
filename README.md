<div align="center">
  <img src="logo.png" alt="Actual Budget" width="120" height="120">

  # Actual Budget MCP

  A Model Context Protocol (MCP) server that gives AI agents raw data access to your [Actual Budget](https://actualbudget.org). Ask complex questions about your spending, get AI-powered budget analysis, and manage your finances conversationally.
</div>

## What This Does

This MCP exposes your Actual Budget as a toolkit for use with AI projects.

## Features

### Data Access
- List all accounts with balances and activity counts
- Get budget categories and spending breakdown
- Query transactions with flexible filtering (date, category, payee, account)
- View category-specific balance and budget status
- Analyze spending trends across time periods
- Find uncategorized transactions

### Budget Management
- Set category budgets by name or ID
- Categorize transactions in bulk
- Create new transactions
- Update transaction details (payee, amount, date, notes)
- Delete transactions and categories
- Sync with bank accounts

### Smart Aggregation
- Get spending totals for any date range
- Calculate average transaction amounts
- Compare spending across periods
- Track account activity
- View historical account balances
- Analyze spending trends over time

### Advanced Features
- Race condition prevention for concurrent requests
- Automatic budget initialization and management
- Bank synchronization support
- Balance history tracking
- Robust error handling and recovery

## Use Cases

### "What are my top 5 spending categories this month?"
Claude calls `get_spending_by_category()` and presents the sorted list.

### "Am I over budget?"
Claude calls `get_budget_totals()`, compares spent vs budgeted, and alerts you.

### "How much more am I spending than last month?"
Claude calls `get_total_spending()` for both periods and calculates the difference.

### "Find all uncategorized restaurant transactions and categorize them as Dining"
Claude finds transactions with `get_uncategorized_transactions()`, filters by payee, then categorizes each with `set_transaction_category()`.

### "Create a transaction for the coffee I just bought"
Claude calls `create_transaction()` with the details you provide.

### "What's my spending trend over the past 3 months?"
Claude calls `get_total_spending()` for each month and generates a trend analysis.

## Installation

### Requirements
- Node.js 18+
- Actual Budget server running locally or remotely
- Claude Code or ChatGPT (with MCP support)

### Setup

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/yourusername/actual-budget-mcp.git
   cd actual-budget-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` with your Actual Budget details**
   ```bash
   ACTUAL_DATA_DIR=../actual-budget-cli/actual-data
   ACTUAL_BUDGET_ID=My-Finances-42bc5bf
   ACTUAL_SERVER_URL=http://localhost:5006
   ACTUAL_PASSWORD=your-password-here
   ```

## Configuration

All configuration is managed through environment variables in a `.env` file. Copy `.env.example` to get started.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ACTUAL_BUDGET_ID` | Yes | — | Your budget ID from Actual Budget |
| `ACTUAL_PASSWORD` | Yes | — | Server authentication password |
| `ACTUAL_SERVER_URL` | No | `http://localhost:5006` | Actual Budget server URL |
| `ACTUAL_DATA_DIR` | No | `../actual-budget-cli/actual-data` | Path to local budget data |
| `READ_ONLY` | No | `false` | Disable write operations (set to `true` or `1`) |

### Read-Only Mode

Enable read-only mode to prevent the AI from modifying your budget data. When enabled, all mutation tools are disabled:

**Disabled tools in read-only mode:**
- `set_category_budget` - Cannot set category budgets
- `set_category_budget_by_id` - Cannot set budgets by ID
- `set_transaction_category` - Cannot categorize transactions
- `update_transaction` - Cannot modify transactions
- `create_transaction` - Cannot create new transactions
- `delete_transaction` - Cannot delete transactions
- `delete_category` - Cannot delete categories

To enable read-only mode, set in your `.env`:
```bash
READ_ONLY=true
```

All data access tools remain fully available. Attempting to call a mutation tool will return an error.

## Deployment

### Run Locally for Testing

```bash
npm start
```

The server listens on stdin/stdout. Press `Ctrl+C` to stop.

## Docker Deployment

### Build and Run with Docker

Build the image:
```bash
docker build -t actual-budget-mcp .
```

Run the container:
```bash
docker run -d \
  --name actual-budget-mcp \
  --restart unless-stopped \
  -e ACTUAL_BUDGET_ID=My-Finances-42bc5bf \
  -e ACTUAL_PASSWORD=your-password \
  -e ACTUAL_SERVER_URL=http://actual-budget:5006 \
  actual-budget-mcp
```

### Docker Compose (Recommended)

Create a `.env` file with your configuration:
```bash
ACTUAL_BUDGET_ID=My-Finances-42bc5bf
ACTUAL_PASSWORD=your-password
ACTUAL_SERVER_URL=http://localhost:5006
READ_ONLY=false
```

Start the container:
```bash
docker-compose up -d
```

View logs:
```bash
docker-compose logs -f actual-budget-mcp
```

Stop the container:
```bash
docker-compose down
```

### VPS Deployment

1. **SSH into your VPS**
   ```bash
   ssh user@your-vps.com
   ```

2. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/actual-budget-mcp.git
   cd actual-budget-mcp
   ```

3. **Create `.env` file with your credentials**
   ```bash
   cp .env.example .env
   nano .env
   ```
   Update with your actual values.

4. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

5. **Connect to Claude/ChatGPT**

   The MCP runs on stdin/stdout inside the container. To use it with Claude Code or ChatGPT on your local machine, you have two options:

   **Option A: SSH Tunnel (Recommended)**

   This forwards the MCP stdio through SSH:
   ```bash
   # On your local machine, connect via SSH tunnel to the VPS-running MCP
   # Configure Claude/ChatGPT MCP server with:
   Command: ssh
   Arguments: user@your-vps.com -N "docker exec -i actual-budget-mcp node index.mjs"
   ```

   **Option B: Local Development Copy**

   Keep a local copy running for development, deploy updated code to VPS:
   ```bash
   # Local machine runs for Claude/ChatGPT
   npm start

   # VPS runs production instance
   docker-compose up -d
   ```

### Container Health & Monitoring

Check container status:
```bash
docker-compose ps
```

View logs:
```bash
docker-compose logs -f --tail 50 actual-budget-mcp
```

Restart if needed:
```bash
docker-compose restart actual-budget-mcp
```

### Network Configuration

If Actual Budget also runs in Docker on the same VPS, update `docker-compose.yml`:

```yaml
services:
  actual-budget-mcp:
    # ... other config
    environment:
      - ACTUAL_SERVER_URL=http://actual-budget:5006  # Use container name
    networks:
      - actual-budget-network

  actual-budget:
    # Your Actual Budget container config
    networks:
      - actual-budget-network

networks:
  actual-budget-network:
    driver: bridge
```

Then use:
```bash
docker-compose up -d
```

## Tool Reference

### Data Access Tools

#### `get_accounts`
Returns all accounts with balances, types, and activity counts.
```javascript
// Returns
[
  {
    id: "acct_123",
    name: "Checking",
    type: "bank",
    balance: 4250.50,
    offBudget: false,
    transactionCount: 42
  },
  ...
]
```

#### `get_categories`
Returns all budget categories.
```javascript
// Returns
[
  {
    id: "cat_456",
    name: "Groceries",
    isGroup: false,
    isHidden: false,
    budgeted: 500.00
  },
  ...
]
```

#### `get_category_by_id(categoryId)`
Returns detailed info for a specific category.
```javascript
// Returns
{
  id: "cat_456",
  name: "Groceries",
  budgeted: 500.00,
  spent: 380.25,
  balance: 119.75,
  isGroup: false,
  isHidden: false
}
```

#### `get_transactions(filters?)`
Returns transactions with optional filtering.
```javascript
// Parameters
{
  category: "cat_456",           // Filter by category ID
  account: "acct_123",            // Filter by account ID
  payee: "whole foods",           // Partial match on payee name
  startDate: "2026-02-01",        // YYYY-MM-DD format
  endDate: "2026-02-28",
  limit: 100,                     // Default: 100
  excludeChild: true              // Exclude split transactions (default: true)
}

// Returns
[
  {
    id: "txn_789",
    date: "2026-02-04",
    account: "acct_123",
    payee: "Whole Foods",
    category: "cat_456",
    amount: 47.50,
    notes: "",
    isTransfer: false
  },
  ...
]
```

#### `get_transaction_by_id(transactionId)`
Returns a single transaction by ID.

#### `get_budget_totals`
Returns overall budget summary.
```javascript
// Returns
{
  totalBudgeted: 4500.00,
  totalSpent: 3680.25,
  remaining: 819.75,
  totalBalance: 12450.50
}
```

#### `get_spending_by_category(filters?)`
Returns spending breakdown by category, sorted by amount spent descending.
```javascript
// Parameters
{
  startDate: "2026-01-01",   // Optional
  endDate: "2026-01-31"
}

// Returns
[
  {
    id: "cat_456",
    name: "Groceries",
    budgeted: 500.00,
    spent: 450.75,
    balance: 49.25,
    remaining: 49.25,
    transactionCount: 12
  },
  ...
]
```

#### `get_total_spending(filters?)`
Returns aggregated spending totals for a date range.
```javascript
// Parameters
{
  startDate: "2026-02-01",   // Optional
  endDate: "2026-02-28"
}

// Returns
{
  totalSpent: 1850.50,
  transactionCount: 34,
  avgTransaction: 54.43,
  dateRange: {
    startDate: "2026-02-01",
    endDate: "2026-02-28"
  }
}
```

#### `get_uncategorized_transactions(limit?)`
Returns transactions without a category.
```javascript
// Parameters
{
  limit: 100  // Default: 100
}

// Returns
[
  {
    id: "txn_789",
    date: "2026-02-04",
    account: "acct_123",
    payee: "Unknown Store",
    amount: 25.00,
    notes: ""
  },
  ...
]
```

#### `get_account_transactions(accountId, limit?)`
Returns transactions for a specific account.
```javascript
// Parameters
{
  accountId: "acct_123",  // Required - Account ID
  limit: 100             // Optional - Default: 100, max recommended: 500
}

// Returns
[
  {
    id: "txn_789",
    date: "2026-02-04",
    payee: "Whole Foods",
    category: "cat_456",
    amount: 47.50,
    notes: "Weekly groceries"
  },
  ...
]
```

#### `get_payees`
Returns all payees in the budget.
```javascript
// Returns
[
  {
    id: "payee_123",
    name: "Whole Foods"
  },
  {
    id: "payee_456",
    name: "Starbucks"
  },
  ...
]
```

### Mutation Tools

#### `set_category_budget(categoryName, amount)`
Set budget for a category by name.
```javascript
// Parameters
{
  categoryName: "Groceries",  // Required - Case-insensitive category name
  amount: 600.00              // Required - Budget amount in dollars
}

// Returns
{
  success: true,
  category: "Groceries",
  newBudget: 600.00
}

// Error Example
{
  success: false,
  error: "Category 'InvalidCategory' not found"
}
```

#### `set_category_budget_by_id(categoryId, amount)`
Set budget for a category by ID (more reliable than name).
```javascript
// Parameters
{
  categoryId: "cat_456",  // Required - Category ID
  amount: 600.00          // Required - Budget amount in dollars
}

// Returns
{
  success: true,
  category: "Groceries",
  newBudget: 600.00
}
```

#### `set_transaction_category(transactionId, categoryNameOrId)`
Categorize a transaction (accepts category name or ID).
```javascript
// Parameters
{
  transactionId: "txn_789",      // Required - Transaction ID to categorize
  categoryNameOrId: "Groceries"  // Required - Category name or ID
}

// Returns
{
  success: true,
  transactionId: "txn_789",
  category: "Groceries"
}

// Error if transaction not found
{
  success: false,
  error: "Transaction with ID 'txn_invalid' not found"
}
```

#### `update_transaction(transactionId, updates)`
Modify transaction details (payee, amount, date, notes, or category).
```javascript
// Parameters
{
  transactionId: "txn_789",        // Required - Transaction ID
  payee: "Whole Foods Market",     // Optional - New payee name
  category: "cat_456",             // Optional - New category (ID or name)
  amount: 50.00,                   // Optional - New amount in dollars
  date: "2026-02-04",              // Optional - New date (YYYY-MM-DD)
  notes: "Weekly groceries"        // Optional - New notes
}

// Returns
{
  success: true,
  transactionId: "txn_789",
  updates: {
    payee: "Whole Foods Market",
    category: "cat_456",
    amount: 50.00,
    date: "2026-02-04",
    notes: "Weekly groceries"
  }
}
```

#### `create_transaction(transaction)`
Create a new transaction in your budget.
```javascript
// Parameters (required: account, payee, amount, date)
{
  account: "acct_123",           // Required - Account ID to post transaction to
  payee: "Starbucks",            // Required - Payee name
  amount: 5.75,                  // Required - Amount in dollars (positive or negative)
  date: "2026-02-04",            // Required - Date in YYYY-MM-DD format
  category: "Coffee",            // Optional - Category name or ID
  notes: "Tuesday morning coffee" // Optional - Transaction notes
}

// Returns
{
  success: true,
  transactionId: "txn_new_999"
}

// Error if account not found
{
  success: false,
  error: "Account 'acct_invalid' not found"
}
```

#### `delete_transaction(transactionId)`
Delete a transaction permanently from your budget.
```javascript
// Parameters
{
  transactionId: "txn_789"  // Required - Transaction ID to delete
}

// Returns
{
  success: true,
  transactionId: "txn_789",
  message: "Transaction deleted: Whole Foods ($47.50)"
}

// Error if not found
{
  success: false,
  error: "Transaction with ID 'txn_invalid' not found"
}
```

#### `delete_category(categoryId)`
Delete a budget category permanently. Transactions in this category are not deleted.
```javascript
// Parameters
{
  categoryId: "cat_456"  // Required - Category ID to delete
}

// Returns
{
  success: true,
  categoryId: "cat_456",
  categoryName: "Groceries",
  message: "Category 'Groceries' deleted"
}

// Error if not found or can't delete
{
  success: false,
  error: "Cannot delete category 'Groceries': category contains active transactions"
}
```

### Advanced Tools

#### `get_balance_history(accountId, limit?)`
Get historical balance progression for an account based on transactions.
```javascript
// Parameters
{
  accountId: "acct_123",  // Required - Account ID
  limit: 30              // Optional - Number of recent transactions (default: 30)
}

// Returns
[
  {
    date: "2026-01-25",
    transaction: "Direct Deposit",
    amount: 2500.00,
    balance: 5250.50
  },
  {
    date: "2026-01-26",
    transaction: "Whole Foods",
    amount: -47.50,
    balance: 5203.00
  },
  ...
]
```

#### `run_bank_sync()`
Initiate synchronization with connected bank accounts.
```javascript
// Parameters
(none)

// Returns
{
  success: true,
  message: "Bank sync initiated",
  timestamp: "2026-02-04T13:45:30.123Z",
  syncStatus: {
    accountsSynced: 3,
    lastSyncTime: "2026-02-04T13:45:00Z"
  }
}

// Error if sync fails
{
  success: false,
  error: "Bank sync failed: Connection to bank server timed out"
}
```

## Error Handling

All mutation tools return errors in this format:
```javascript
{
  success: false,
  error: "Description of what went wrong"
}
```

**Common errors:**
- `"Category '...' not found"` - Category name/ID doesn't exist
- `"Transaction with ID '...' not found"` - Transaction ID doesn't exist
- `"Account '...' not found"` - Account ID doesn't exist
- `"ACTUAL_BUDGET_ID environment variable is required"` - Configuration issue
- `"Connection refused"` - Actual Budget server not running

## Troubleshooting

### "Cannot find module '@actual-app/api'"
- Run `npm install`
- Verify Node.js version is 18+

### "ACTUAL_BUDGET_ID environment variable is required"
- Create `.env` file (copy from `.env.example`)
- Set `ACTUAL_BUDGET_ID=your-budget-id`

### "Connection refused localhost:5006"
- Verify Actual Budget server is running
- Check `ACTUAL_SERVER_URL` in `.env` is correct

### MCP not appearing in Claude/ChatGPT
- Use absolute paths (not relative) in MCP configuration
- Restart Claude Code or ChatGPT after adding the server
- Check that the server starts: `npm start` should not show errors

### Transactions not appearing
- Verify you're querying the correct account/category IDs
- Use `get_accounts()` and `get_categories()` to list available IDs
- Check date filters if using `startDate`/`endDate`

### "Tool is disabled in read-only mode"
- Check if `READ_ONLY=true` in your `.env` file
- Set `READ_ONLY=false` or remove the variable to enable write operations
- All data access tools work in read-only mode, only mutations are disabled

## License

MIT

## Support

For issues, questions, or feature requests, open an issue on GitHub or refer to the [Actual Budget documentation](https://actualbudget.org/).

