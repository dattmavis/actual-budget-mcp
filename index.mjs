#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import api from "@actual-app/api";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configuration from environment variables
const DATA_DIR = process.env.ACTUAL_DATA_DIR || "../actual-budget-cli/actual-data";
const BUDGET_ID = process.env.ACTUAL_BUDGET_ID;
const SERVER_URL = process.env.ACTUAL_SERVER_URL || "http://localhost:5006";
const PASSWORD = process.env.ACTUAL_PASSWORD;

// Validate required configuration
if (!BUDGET_ID) {
  console.error("Error: ACTUAL_BUDGET_ID environment variable is required");
  process.exit(1);
}

if (!PASSWORD) {
  console.error("Error: ACTUAL_PASSWORD environment variable is required");
  process.exit(1);
}

// Read-only mode configuration
const READ_ONLY = process.env.READ_ONLY === "true" || process.env.READ_ONLY === "1";

// Robust initialization with race condition prevention
let initialized = false;
let initializing = false;
let initializationError = null;

const server = new Server(
  {
    name: "actual-budget-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

async function initBudget() {
  // Return early if already initialized
  if (initialized) return;
  if (initializationError) throw initializationError;

  // Wait if initialization is in progress (prevent race conditions)
  if (initializing) {
    while (initializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (initializationError) throw initializationError;
    return;
  }

  initializing = true;
  try {
    await api.init({
      dataDir: DATA_DIR,
      serverURL: SERVER_URL,
      password: PASSWORD,
    });

    await api.loadBudget(BUDGET_ID);
    initialized = true;
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error(String(error));
    throw initializationError;
  } finally {
    initializing = false;
  }
}

async function shutdownBudget() {
  if (initialized) {
    await api.shutdown();
    initialized = false;
    initializing = false;
    initializationError = null;
  }
}

// Raw data access tools

async function getAccounts() {
  await initBudget();
  const accounts = await api.getAccounts();
  const transactions = await api.getTransactions();

  return accounts.map(a => {
    const accountTransactionCount = transactions.filter(t => t.account === a.id && !t.isChild).length;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance / 100,
      offBudget: a.offBudget,
      transactionCount: accountTransactionCount,
    };
  });
}

async function getCategories() {
  await initBudget();
  const categories = await api.getCategories();
  return categories.map(c => ({
    id: c.id,
    name: c.name,
    isGroup: c.isGroup,
    isHidden: c.isHidden,
    budgeted: c.budgeted / 100,
  }));
}

async function getCategoryById(categoryId) {
  await initBudget();
  const categories = await api.getCategories();
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;

  const balance = await api.getCategoryBalance(categoryId);
  return {
    id: category.id,
    name: category.name,
    budgeted: category.budgeted / 100,
    spent: Math.abs(balance) / 100,
    balance: balance / 100,
    isGroup: category.isGroup,
    isHidden: category.isHidden,
  };
}

async function getTransactions(filters = {}) {
  await initBudget();

  let transactions = await api.getTransactions();

  // Filter by category
  if (filters.category) {
    transactions = transactions.filter(t => t.category === filters.category);
  }

  // Filter by account
  if (filters.account) {
    transactions = transactions.filter(t => t.account === filters.account);
  }

  // Filter by date range
  if (filters.startDate) {
    transactions = transactions.filter(t => t.date >= filters.startDate);
  }
  if (filters.endDate) {
    transactions = transactions.filter(t => t.date <= filters.endDate);
  }

  // Filter by payee
  if (filters.payee) {
    const payeeLower = filters.payee.toLowerCase();
    transactions = transactions.filter(t =>
      (t.payee_name || "").toLowerCase().includes(payeeLower)
    );
  }

  // Filter out child transactions (splits)
  if (filters.excludeChild !== false) {
    transactions = transactions.filter(t => !t.isChild);
  }

  // Limit results
  const limit = filters.limit || 100;
  transactions = transactions.slice(0, limit);

  // Sort by date descending
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  return transactions.map(t => ({
    id: t.id,
    date: t.date,
    account: t.account,
    payee: t.payee_name || "Unknown",
    category: t.category,
    amount: t.amount / 100,
    notes: t.notes || "",
    isTransfer: t.isTransfer || false,
  }));
}

async function getTransactionById(transactionId) {
  await initBudget();
  const transactions = await api.getTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) return null;

  return {
    id: transaction.id,
    date: transaction.date,
    account: transaction.account,
    payee: transaction.payee_name || "Unknown",
    category: transaction.category,
    amount: transaction.amount / 100,
    notes: transaction.notes || "",
    isTransfer: transaction.isTransfer || false,
  };
}

async function getBudgetTotals() {
  await initBudget();

  const categories = await api.getCategories();
  const accounts = await api.getAccounts();

  let totalBudgeted = 0;
  let totalSpent = 0;
  let totalBalance = 0;

  for (const category of categories) {
    if (!category.isHidden && !category.isGroup) {
      const balance = await api.getCategoryBalance(category.id);
      totalBudgeted += category.budgeted || 0;
      totalSpent += Math.abs(balance);
    }
  }

  for (const account of accounts) {
    if (!account.offBudget) {
      totalBalance += account.balance || 0;
    }
  }

  return {
    totalBudgeted: totalBudgeted / 100,
    totalSpent: totalSpent / 100,
    remaining: (totalBudgeted - totalSpent) / 100,
    totalBalance: totalBalance / 100,
  };
}

async function getSpendingByCategory(filters = {}) {
  await initBudget();

  const categories = await api.getCategories();
  const spending = [];

  for (const category of categories) {
    if (category.isHidden || category.isGroup) continue;

    // Get spending for this category
    let categoryTransactions = await api.getTransactions();
    categoryTransactions = categoryTransactions.filter(t =>
      t.category === category.id && !t.isChild
    );

    // Apply date filters if provided
    if (filters.startDate) {
      categoryTransactions = categoryTransactions.filter(t => t.date >= filters.startDate);
    }
    if (filters.endDate) {
      categoryTransactions = categoryTransactions.filter(t => t.date <= filters.endDate);
    }

    const totalSpent = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const balance = await api.getCategoryBalance(category.id);

    spending.push({
      id: category.id,
      name: category.name,
      budgeted: category.budgeted / 100,
      spent: totalSpent / 100,
      balance: balance / 100,
      remaining: (category.budgeted + balance) / 100,
      transactionCount: categoryTransactions.length,
    });
  }

  return spending.sort((a, b) => b.spent - a.spent);
}

// Mutation tools

async function setCategoryBudget(categoryName, amount) {
  await initBudget();

  const categories = await api.getCategories();
  const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());

  if (!category) {
    throw new Error(`Category "${categoryName}" not found`);
  }

  await api.setBudget(category.id, Math.round(amount * 100));

  return {
    success: true,
    category: category.name,
    newBudget: amount,
  };
}

async function setCategoryBudgetById(categoryId, amount) {
  await initBudget();

  const categories = await api.getCategories();
  const category = categories.find(c => c.id === categoryId);

  if (!category) {
    throw new Error(`Category with ID "${categoryId}" not found`);
  }

  await api.setBudget(categoryId, Math.round(amount * 100));

  return {
    success: true,
    category: category.name,
    newBudget: amount,
  };
}

async function updateTransaction(transactionId, updates) {
  await initBudget();

  const transactions = await api.getTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error(`Transaction with ID "${transactionId}" not found`);
  }

  const payload = {};
  if (updates.payee) payload.payee_name = updates.payee;
  if (updates.category) payload.category = updates.category;
  if (updates.amount !== undefined) payload.amount = Math.round(updates.amount * 100);
  if (updates.date) payload.date = updates.date;
  if (updates.notes) payload.notes = updates.notes;

  await api.updateTransaction(transactionId, payload);

  return {
    success: true,
    transactionId,
    updates: payload,
  };
}

async function setTransactionCategory(transactionId, categoryNameOrId) {
  await initBudget();

  const transactions = await api.getTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error(`Transaction with ID "${transactionId}" not found`);
  }

  // Find category by name or ID
  const categories = await api.getCategories();
  let category = categories.find(c => c.id === categoryNameOrId);

  if (!category) {
    category = categories.find(c =>
      c.name.toLowerCase() === categoryNameOrId.toLowerCase()
    );
  }

  if (!category) {
    throw new Error(`Category "${categoryNameOrId}" not found`);
  }

  await api.updateTransaction(transactionId, { category: category.id });

  return {
    success: true,
    transactionId,
    category: category.name,
  };
}

async function getPayees() {
  await initBudget();
  const payees = await api.getPayees();
  return payees.map(p => ({
    id: p.id,
    name: p.name,
  }));
}

async function createTransaction(transaction) {
  await initBudget();

  const payload = {
    account: transaction.account,
    payee: transaction.payee,
    amount: Math.round(transaction.amount * 100),
    date: transaction.date,
  };

  if (transaction.category) {
    // Find category
    const categories = await api.getCategories();
    let category = categories.find(c => c.id === transaction.category);
    if (!category) {
      category = categories.find(c =>
        c.name.toLowerCase() === transaction.category.toLowerCase()
      );
    }
    if (category) {
      payload.category = category.id;
    }
  }

  if (transaction.notes) {
    payload.notes = transaction.notes;
  }

  const result = await api.addTransaction(payload);

  return {
    success: true,
    transactionId: result,
  };
}

async function getAccountTransactions(accountId, limit = 100) {
  await initBudget();

  let transactions = await api.getTransactions();
  transactions = transactions
    .filter(t => t.account === accountId && !t.isChild)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);

  return transactions.map(t => ({
    id: t.id,
    date: t.date,
    payee: t.payee_name || "Unknown",
    category: t.category,
    amount: t.amount / 100,
    notes: t.notes || "",
  }));
}

async function getTotalSpending(filters = {}) {
  await initBudget();

  let transactions = await api.getTransactions();

  // Filter by date range
  if (filters.startDate) {
    transactions = transactions.filter(t => t.date >= filters.startDate);
  }
  if (filters.endDate) {
    transactions = transactions.filter(t => t.date <= filters.endDate);
  }

  // Exclude child transactions (splits)
  transactions = transactions.filter(t => !t.isChild);

  // Calculate totals
  const totalSpent = Math.abs(transactions.reduce((sum, t) => sum + t.amount, 0));
  const transactionCount = transactions.length;
  const avgTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

  return {
    totalSpent: totalSpent / 100,
    transactionCount,
    avgTransaction: avgTransaction / 100,
    dateRange: {
      startDate: filters.startDate || "all time",
      endDate: filters.endDate || "today",
    },
  };
}

async function getUncategorizedTransactions(limit = 100) {
  await initBudget();

  let transactions = await api.getTransactions();
  transactions = transactions
    .filter(t => !t.category && !t.isChild)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);

  return transactions.map(t => ({
    id: t.id,
    date: t.date,
    account: t.account,
    payee: t.payee_name || "Unknown",
    amount: t.amount / 100,
    notes: t.notes || "",
  }));
}

// Balance History - get balance changes over time
async function getBalanceHistory(accountId, limit = 30) {
  await initBudget();

  const transactions = await api.getTransactions();
  const accountTransactions = transactions
    .filter(t => t.account === accountId && !t.isChild)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate running balance
  let runningBalance = 0;
  const history = [];

  accountTransactions.slice(-limit).forEach(t => {
    runningBalance += t.amount;
    history.push({
      date: t.date,
      transaction: t.payee_name || "Unknown",
      amount: t.amount / 100,
      balance: runningBalance / 100,
    });
  });

  return history;
}

// Delete Transaction
async function deleteTransaction(transactionId) {
  await initBudget();

  const transactions = await api.getTransactions();
  const transaction = transactions.find(t => t.id === transactionId);

  if (!transaction) {
    throw new Error(`Transaction with ID "${transactionId}" not found`);
  }

  await api.deleteTransaction(transactionId);

  return {
    success: true,
    transactionId,
    message: `Transaction deleted: ${transaction.payee_name || "Unknown"} ($${(transaction.amount / 100).toFixed(2)})`,
  };
}

// Delete Category
async function deleteCategory(categoryId) {
  await initBudget();

  const categories = await api.getCategories();
  const category = categories.find(c => c.id === categoryId);

  if (!category) {
    throw new Error(`Category with ID "${categoryId}" not found`);
  }

  try {
    await api.deleteCategory(categoryId);
    return {
      success: true,
      categoryId,
      categoryName: category.name,
      message: `Category "${category.name}" deleted`,
    };
  } catch (error) {
    throw new Error(`Cannot delete category "${category.name}": ${error.message}`);
  }
}

// Run Bank Sync
async function runBankSync() {
  await initBudget();

  try {
    const syncStatus = await api.getBankSyncStatus();

    // Attempt to sync
    await api.syncBankAccounts();

    return {
      success: true,
      message: "Bank sync initiated",
      timestamp: new Date().toISOString(),
      syncStatus,
    };
  } catch (error) {
    throw new Error(`Bank sync failed: ${error.message}`);
  }
}

// List all tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
    {
      name: "get_accounts",
      description: "Get all accounts with their balances and types",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
      {
        name: "get_categories",
        description: "Get all budget categories with their budget amounts",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_category_by_id",
        description: "Get detailed info for a specific category including balance",
        inputSchema: {
          type: "object",
          properties: {
            categoryId: {
              type: "string",
              description: "The category ID",
            },
          },
          required: ["categoryId"],
        },
      },
      {
        name: "get_transactions",
        description: "Get transactions with optional filters",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Filter by category ID",
            },
            account: {
              type: "string",
              description: "Filter by account ID",
            },
            payee: {
              type: "string",
              description: "Filter by payee name (partial match)",
            },
            startDate: {
              type: "string",
              description: "Filter by start date (YYYY-MM-DD)",
            },
            endDate: {
              type: "string",
              description: "Filter by end date (YYYY-MM-DD)",
            },
            limit: {
              type: "number",
              description: "Maximum number of transactions (default: 100)",
            },
            excludeChild: {
              type: "boolean",
              description: "Exclude split child transactions (default: true)",
            },
          },
          required: [],
        },
      },
      {
        name: "get_transaction_by_id",
        description: "Get a specific transaction by ID",
        inputSchema: {
          type: "object",
          properties: {
            transactionId: {
              type: "string",
              description: "The transaction ID",
            },
          },
          required: ["transactionId"],
        },
      },
      {
        name: "get_budget_totals",
        description: "Get overall budget totals: budgeted, spent, remaining, and account balance",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_spending_by_category",
        description: "Get spending breakdown by category, sorted by amount spent",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Filter from date (YYYY-MM-DD)",
            },
            endDate: {
              type: "string",
              description: "Filter to date (YYYY-MM-DD)",
            },
          },
          required: [],
        },
      },
      {
        name: "get_payees",
        description: "Get all payees in your budget",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_account_transactions",
        description: "Get all transactions for a specific account",
        inputSchema: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "The account ID",
            },
            limit: {
              type: "number",
              description: "Maximum number of transactions (default: 100)",
            },
          },
          required: ["accountId"],
        },
      },
      {
        name: "get_total_spending",
        description: "Get total spending across all categories for a date range",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date (YYYY-MM-DD) - optional",
            },
            endDate: {
              type: "string",
              description: "End date (YYYY-MM-DD) - optional",
            },
          },
          required: [],
        },
      },
      {
        name: "get_uncategorized_transactions",
        description: "Get all transactions that haven't been categorized yet",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of transactions (default: 100)",
            },
          },
          required: [],
        },
      },
    ];

    // Add mutation tools only if not in read-only mode
    if (!READ_ONLY) {
      tools.push(
        {
          name: "set_category_budget",
          description: "Set the budget amount for a category by name",
          inputSchema: {
            type: "object",
            properties: {
              categoryName: {
                type: "string",
                description: "The category name",
              },
              amount: {
                type: "number",
                description: "Budget amount in dollars",
              },
            },
            required: ["categoryName", "amount"],
          },
        },
        {
          name: "set_category_budget_by_id",
          description: "Set the budget amount for a category by ID",
          inputSchema: {
            type: "object",
            properties: {
              categoryId: {
                type: "string",
                description: "The category ID",
              },
              amount: {
                type: "number",
                description: "Budget amount in dollars",
              },
            },
            required: ["categoryId", "amount"],
          },
        },
        {
          name: "set_transaction_category",
          description: "Set or change the category for a transaction",
          inputSchema: {
            type: "object",
            properties: {
              transactionId: {
                type: "string",
                description: "The transaction ID",
              },
              categoryNameOrId: {
                type: "string",
                description: "Category name or ID",
              },
            },
            required: ["transactionId", "categoryNameOrId"],
          },
        },
        {
          name: "update_transaction",
          description: "Update transaction details like payee, amount, date, or notes",
          inputSchema: {
            type: "object",
            properties: {
              transactionId: {
                type: "string",
                description: "The transaction ID",
              },
              payee: {
                type: "string",
                description: "New payee name",
              },
              category: {
                type: "string",
                description: "New category ID",
              },
              amount: {
                type: "number",
                description: "New amount in dollars",
              },
              date: {
                type: "string",
                description: "New date (YYYY-MM-DD)",
              },
              notes: {
                type: "string",
                description: "New notes",
              },
            },
            required: ["transactionId"],
          },
        },
        {
          name: "create_transaction",
          description: "Create a new transaction",
          inputSchema: {
            type: "object",
            properties: {
              account: {
                type: "string",
                description: "Account ID",
              },
              payee: {
                type: "string",
                description: "Payee name",
              },
              amount: {
                type: "number",
                description: "Amount in dollars (positive for expenses, negative for income)",
              },
              date: {
                type: "string",
                description: "Date (YYYY-MM-DD)",
              },
              category: {
                type: "string",
                description: "Category name or ID (optional)",
              },
              notes: {
                type: "string",
                description: "Notes (optional)",
              },
            },
            required: ["account", "payee", "amount", "date"],
          },
        },
        {
          name: "delete_transaction",
          description: "Delete a transaction permanently",
          inputSchema: {
            type: "object",
            properties: {
              transactionId: {
                type: "string",
                description: "The transaction ID to delete",
              },
            },
            required: ["transactionId"],
          },
        },
        {
          name: "delete_category",
          description: "Delete a budget category permanently",
          inputSchema: {
            type: "object",
            properties: {
              categoryId: {
                type: "string",
                description: "The category ID to delete",
              },
            },
            required: ["categoryId"],
          },
        }
      );
    }

    // Tools available in all modes
    tools.push(
      {
        name: "get_balance_history",
        description: "Get historical balance for an account",
        inputSchema: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "The account ID",
            },
            limit: {
              type: "number",
              description: "Number of recent transactions to include (default: 30)",
            },
          },
          required: ["accountId"],
        },
      },
      {
        name: "run_bank_sync",
        description: "Initiate bank account synchronization",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      }
    );

    return { tools };
});



// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Check read-only mode for mutation tools
    const mutationTools = [
      "set_category_budget",
      "set_category_budget_by_id",
      "set_transaction_category",
      "update_transaction",
      "create_transaction",
      "delete_transaction",
      "delete_category",
    ];

    if (READ_ONLY && mutationTools.includes(request.params.name)) {
      throw new Error(
        `Tool "${request.params.name}" is disabled in read-only mode. Set READ_ONLY=false to enable mutations.`
      );
    }

    let result;

    switch (request.params.name) {
      case "get_accounts":
        result = await getAccounts();
        break;

      case "get_categories":
        result = await getCategories();
        break;

      case "get_category_by_id":
        result = await getCategoryById(request.params.arguments.categoryId);
        break;

      case "get_transactions":
        result = await getTransactions(request.params.arguments);
        break;

      case "get_transaction_by_id":
        result = await getTransactionById(request.params.arguments.transactionId);
        break;

      case "get_budget_totals":
        result = await getBudgetTotals();
        break;

      case "get_spending_by_category":
        result = await getSpendingByCategory(request.params.arguments);
        break;

      case "set_category_budget":
        result = await setCategoryBudget(
          request.params.arguments.categoryName,
          request.params.arguments.amount
        );
        break;

      case "set_category_budget_by_id":
        result = await setCategoryBudgetById(
          request.params.arguments.categoryId,
          request.params.arguments.amount
        );
        break;

      case "set_transaction_category":
        result = await setTransactionCategory(
          request.params.arguments.transactionId,
          request.params.arguments.categoryNameOrId
        );
        break;

      case "update_transaction":
        result = await updateTransaction(
          request.params.arguments.transactionId,
          request.params.arguments
        );
        break;

      case "get_payees":
        result = await getPayees();
        break;

      case "create_transaction":
        result = await createTransaction(request.params.arguments);
        break;

      case "get_account_transactions":
        result = await getAccountTransactions(
          request.params.arguments.accountId,
          request.params.arguments.limit
        );
        break;

      case "get_total_spending":
        result = await getTotalSpending(request.params.arguments);
        break;

      case "get_uncategorized_transactions":
        result = await getUncategorizedTransactions(
          request.params.arguments.limit
        );
        break;

      case "get_balance_history":
        result = await getBalanceHistory(
          request.params.arguments.accountId,
          request.params.arguments.limit
        );
        break;

      case "delete_transaction":
        result = await deleteTransaction(
          request.params.arguments.transactionId
        );
        break;

      case "delete_category":
        result = await deleteCategory(
          request.params.arguments.categoryId
        );
        break;

      case "run_bank_sync":
        result = await runBankSync();
        break;

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
