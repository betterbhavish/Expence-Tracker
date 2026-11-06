import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  DollarSign,
  LogOut,
  Search,
  Trash2,
  Wallet,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  PiggyBank
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { supabase, hasSupabase } from './lib/supabase';
import { demoTransactions } from './data/demoTransactions';

const categoryOptions = ['Food', 'Rent', 'Travel', 'Utilities', 'Leisure'];
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
});

const formatMoney = (value) => currencyFormatter.format(value || 0);

const getDateOnly = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const sortTransactions = (items) =>
  [...items].sort((a, b) => new Date(b.date) - new Date(a.date));

const aggregateByPeriod = (transactions, view) => {
  const map = new Map();

  transactions.forEach((item) => {
    const date = new Date(item.date);
    let key = '';
    let label = '';

    if (view === 'daily') {
      key = date.toISOString().slice(0, 10);
      label = new Date(key).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } else if (view === 'weekly') {
      const start = new Date(date);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      key = start.toISOString().slice(0, 10);
      label = new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      label = new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric'
      });
    }

    if (!map.has(key)) {
      map.set(key, { label, income: 0, expense: 0 });
    }

    const bucket = map.get(key);
    if (item.type === 'INCOME') bucket.income += Number(item.amount || 0);
    else bucket.expense += Number(item.amount || 0);
  });

  return [...map.values()].sort((a, b) => new Date(a.label) - new Date(b.label));
};

function App() {
  const [session, setSession] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [chartView, setChartView] = useState('daily');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [formData, setFormData] = useState({
    amount: '',
    type: 'EXPENSE',
    category: 'Food',
    date: getDateOnly(new Date()),
    note: ''
  });

  const getStoredTransactions = () => {
    const stored = localStorage.getItem('minimal-expense-tracker-transactions');
    if (!stored) return demoTransactions;
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length ? parsed : demoTransactions;
    } catch {
      return demoTransactions;
    }
  };

  const persistTransactions = (items) => {
    localStorage.setItem('minimal-expense-tracker-transactions', JSON.stringify(items));
  };

  useEffect(() => {
    const initialize = async () => {
      if (!hasSupabase || !supabase) {
        setTransactions(getStoredTransactions());
        setSession(null);
        setLoading(false);
        return;
      }

      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession();
      setSession(currentSession);

      if (currentSession) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', currentSession.user.id)
          .order('date', { ascending: false });

        if (!error && data) {
          setTransactions(data);
        } else {
          setTransactions(getStoredTransactions());
        }
      } else {
        setTransactions(getStoredTransactions());
      }

      const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) {
          const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', nextSession.user.id)
            .order('date', { ascending: false });

          if (!error && data) setTransactions(data);
        } else {
          setTransactions(getStoredTransactions());
        }
      });

      setLoading(false);
      return () => authListener?.subscription?.unsubscribe?.();
    };

    initialize();
  }, []);

  useEffect(() => {
    if (!session && !hasSupabase) {
      persistTransactions(transactions);
    }
  }, [transactions, session]);

  const filteredTransactions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return sortTransactions(
      transactions.filter((item) => {
        const matchesSearch =
          !search ||
          item.note?.toLowerCase().includes(search) ||
          item.category?.toLowerCase().includes(search);

        const itemDate = new Date(item.date);
        const inStartRange = !startDate || itemDate >= new Date(startDate);
        const inEndRange = !endDate || itemDate <= new Date(`${endDate}T23:59:59`);

        return matchesSearch && inStartRange && inEndRange;
      })
    );
  }, [transactions, searchTerm, startDate, endDate]);

  const totals = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === 'INCOME')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expense = transactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      income,
      expense,
      balance: income - expense
    };
  }, [transactions]);

  const chartData = useMemo(() => aggregateByPeriod(filteredTransactions, chartView), [filteredTransactions, chartView]);

  const byCategory = useMemo(() => {
    const expenses = transactions.filter((item) => item.type === 'EXPENSE');
    const totalsByCategory = {};

    expenses.forEach((item) => {
      totalsByCategory[item.category] = (totalsByCategory[item.category] || 0) + Number(item.amount || 0);
    });

    const totalExpense = Object.values(totalsByCategory).reduce((sum, value) => sum + value, 0);
    return Object.entries(totalsByCategory)
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalExpense ? (value / totalExpense) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const handleSocialLogin = async () => {
    if (!hasSupabase || !supabase) {
      window.alert('Add your Supabase project URL and anon key in .env to enable Google OAuth.');
      return;
    }

    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    setAuthLoading(false);

    if (error) {
      window.alert(error.message || 'Login failed.');
    }
  };

  const handleSignOut = async () => {
    if (hasSupabase && supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddTransaction = async () => {
    const amount = Number(formData.amount);
    if (!amount || amount <= 0) {
      window.alert('Please enter a valid amount greater than zero.');
      return;
    }

    const newItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      amount: Number(amount.toFixed(2)),
      type: formData.type,
      category: formData.category,
      date: formData.date || getDateOnly(new Date()),
      note: formData.note.trim() || 'Untitled',
      created_at: new Date().toISOString()
    };

    if (hasSupabase && supabase && session) {
      const { error } = await supabase.from('transactions').insert([
        {
          ...newItem,
          user_id: session.user.id
        }
      ]);

      if (error) {
        window.alert(error.message || 'Unable to save transaction.');
        return;
      }

      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (data) setTransactions(data);
    } else {
      const next = sortTransactions([newItem, ...transactions]);
      setTransactions(next);
      persistTransactions(next);
    }

    setFormData({
      amount: '',
      type: 'EXPENSE',
      category: 'Food',
      date: getDateOnly(new Date()),
      note: ''
    });
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Delete this transaction?');
    if (!confirmed) return;

    if (hasSupabase && supabase && session) {
      const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', session.user.id);
      if (error) {
        window.alert(error.message || 'Unable to delete transaction.');
        return;
      }

      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });

      if (data) setTransactions(data);
      return;
    }

    const next = transactions.filter((item) => item.id !== id);
    setTransactions(next);
    persistTransactions(next);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading your wallet...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Finance</p>
                <h1 className="text-xl font-semibold text-slate-900">Minimal Expense Tracker</h1>
              </div>
            </div>

            {session ? (
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <img
                    src={session.user?.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(session.user?.email || 'User')}
                    alt="User avatar"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div className="hidden text-left sm:block">
                    <p className="text-xs text-slate-500">Signed in</p>
                    <p className="text-sm font-medium text-slate-700">{session.user?.email || 'Google User'}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSocialLogin}
                disabled={authLoading}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {authLoading ? 'Connecting...' : 'Sign in with Google'}
              </button>
            )}
          </div>
        </header>

        {!session && hasSupabase ? (
          <div className="mb-6 flex min-h-[240px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-soft">
            <div className="max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                <PiggyBank className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
              <p className="mt-2 text-sm text-slate-600">
                Sign in to sync your spending data across all devices.
              </p>
              <button
                type="button"
                onClick={handleSocialLogin}
                disabled={authLoading}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {authLoading ? 'Connecting...' : 'Sign in with Google'}
              </button>
            </div>
          </div>
        ) : null}

        {session || !hasSupabase ? (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">Total Received</p>
                  <span className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                    <ArrowUpCircle className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-2xl font-semibold text-emerald-600">{formatMoney(totals.income)}</h3>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">Total Spent</p>
                  <span className="rounded-full bg-rose-50 p-2 text-rose-600">
                    <ArrowDownCircle className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-rose-600">{formatMoney(totals.expense)}</h3>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">Net Balance</p>
                  <span className={`rounded-full p-2 ${totals.balance >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {totals.balance >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </span>
                </div>
                <h3 className={`text-2xl font-semibold ${totals.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatMoney(totals.balance)}
                </h3>
              </div>
            </section>

            <section className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Cash Flow</h2>
                    <p className="text-sm text-slate-500">Transactions over time</p>
                  </div>
                  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {['daily', 'weekly', 'monthly'].map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setChartView(period)}
                        className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
                          chartView === period ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatMoney(value)} />
                      <Bar dataKey="income" fill="#10B981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expense" fill="#EF4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Spending</h2>
                    <p className="text-sm text-slate-500">By category</p>
                  </div>
                  <div className="rounded-full bg-rose-50 p-2 text-rose-600">
                    <DollarSign className="h-4 w-4" />
                  </div>
                </div>

                {byCategory.length ? (
                  <>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={byCategory} cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={4} dataKey="value">
                            {byCategory.map((entry, index) => (
                              <Cell
                                key={`${entry.name}-${index}`}
                                fill={['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6'][index % 5]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatMoney(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-2">
                      {byCategory.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6'][index % 5]
                              }}
                            />
                            <span className="text-slate-600">{item.name}</span>
                          </div>
                          <span className="font-medium text-slate-800">{item.percentage.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                    No expense data yet.
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-4 flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-slate-700" />
                  <h2 className="text-lg font-semibold text-slate-900">Add Transaction</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount</label>
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none ring-0 transition focus:border-slate-300 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      {['INCOME', 'EXPENSE'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, type }))}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                            formData.type === type
                              ? type === 'INCOME'
                                ? 'bg-emerald-500 text-white'
                                : 'bg-rose-500 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          {type === 'INCOME' ? 'Money Received' : 'Money Spent'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                    <input
                      name="date"
                      type="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Note</label>
                    <input
                      name="note"
                      type="text"
                      value={formData.note}
                      onChange={handleInputChange}
                      placeholder="Short description"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddTransaction}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Add Transaction
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
                    <p className="text-sm text-slate-500">Recent entries</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                    <Search className="h-4 w-4" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search"
                      className="w-28 border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>From</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>To</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-300 focus:bg-white"
                    />
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2 text-left">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium">Note</th>
                        <th className="pb-2 font-medium">Amount</th>
                        <th className="pb-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length ? (
                        filteredTransactions.map((transaction) => (
                          <tr key={transaction.id} className="rounded-xl bg-slate-50 text-sm text-slate-700">
                            <td className="rounded-l-xl px-3 py-3 align-middle">
                              {new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  transaction.type === 'INCOME'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {transaction.type}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle">{transaction.category}</td>
                            <td className="px-3 py-3 align-middle">{transaction.note || '—'}</td>
                            <td
                              className={`px-3 py-3 align-middle font-semibold ${
                                transaction.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {transaction.type === 'INCOME' ? '+' : '-'}
                              {formatMoney(transaction.amount)}
                            </td>
                            <td className="rounded-r-xl px-3 py-3 align-middle">
                              <button
                                type="button"
                                onClick={() => handleDelete(transaction.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-10 text-center text-sm text-slate-500">
                            No transactions match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default App;
