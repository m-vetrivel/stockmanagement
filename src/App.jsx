import { useState, useEffect, useMemo } from 'react';
import { generateInventory, generateSalesHistory, DEALERS } from './data';
import './index.css';

// Helper to format date
const formatDate = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function App() {
  // Client-side Router State
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Synchronize routing path changes
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Global State
  const [simulatedToday, setSimulatedToday] = useState(new Date().toISOString().split('T')[0]);
  const [inventory, setInventory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  
  const [orders, setOrders] = useState([]);
  const [ignored, setIgnored] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [salesFilter, setSalesFilter] = useState('1m'); // '1w', '1m', '2m', '3m'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [ordersFilter, setOrdersFilter] = useState('all'); // 'all', '30d', '60d', '90d'
  const [ignoredFilter, setIgnoredFilter] = useState('all'); // 'all', '30d', '60d', '90d'
  const [showOnlyUnplaced, setShowOnlyUnplaced] = useState(false);

  // Version 2 Modal & Actions State
  const [orderModalItem, setOrderModalItem] = useState(null);
  const [orderQuantityInput, setOrderQuantityInput] = useState('');
  const [orderDealerInput, setOrderDealerInput] = useState('');
  const [groupByDealers, setGroupByDealers] = useState(false);
  const [expandedDealers, setExpandedDealers] = useState({});
  const [copiedDealer, setCopiedDealer] = useState(null);

  // Initialize Data
  useEffect(() => {
    const newInventory = generateInventory();
    setInventory(newInventory);
    setSalesHistory(generateSalesHistory(newInventory, simulatedToday));
  }, []);

  // Handle changing the simulated "Today" date
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setSimulatedToday(newDate);
    if (inventory.length > 0) {
      setSalesHistory(generateSalesHistory(inventory, newDate));
    }
  };

  // V1 - Move an item to Orders (immediate, using defaults)
  const placeOrderV1 = (item) => {
    const defaultQty = Math.max(1, item.minQuantity - item.currentQuantity);
    setOrders(prev => [
      ...prev, 
      { 
        ...item, 
        orderDate: simulatedToday, 
        quantityOrdered: defaultQty, 
        dealer: 'Apex Tex Mills', // Default fallback dealer
        placedAt: Date.now(),
        placed: false
      }
    ]);
    setIgnored(prev => prev.filter(i => i.id !== item.id));
  };

  // V2 - Initiate Order flow (opens modal dialog)
  const initiateOrderV2 = (item) => {
    setOrderModalItem(item);
    const suggestedQty = Math.max(1, item.minQuantity - item.currentQuantity);
    setOrderQuantityInput(suggestedQty.toString());
    setOrderDealerInput(DEALERS[0]);
  };

  // V2 - Confirms order inside modal
  const confirmOrderV2 = () => {
    if (!orderModalItem) return;
    const qty = parseInt(orderQuantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid positive quantity.");
      return;
    }

    setOrders(prev => [
      ...prev,
      {
        ...orderModalItem,
        orderDate: simulatedToday,
        quantityOrdered: qty,
        dealer: orderDealerInput,
        placedAt: Date.now(),
        placed: false
      }
    ]);

    setIgnored(prev => prev.filter(i => i.id !== orderModalItem.id));
    setOrderModalItem(null);
  };

  // Move an item to Ignored
  const ignoreItem = (item) => {
    setIgnored(prev => [...prev, { ...item, ignoreDate: simulatedToday, ignoredAt: Date.now() }]);
  };

  // Mark an order as placed
  const markAsPlaced = (orderId) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, placed: true } : o));
  };

  // Mark all orders for a dealer as placed
  const markDealerAsPlaced = (dealerName) => {
    setOrders(prev => prev.map(o => o.dealer === dealerName ? { ...o, placed: true } : o));
  };

  // Process Dashboard Items (Low Stock & Sold in Period)
  const dashboardItems = useMemo(() => {
    const today = new Date(simulatedToday);
    
    // Determine cutoff date based on filter
    const cutoffDate = new Date(today);
    if (salesFilter === '1w') cutoffDate.setDate(today.getDate() - 7);
    else if (salesFilter === '1m') cutoffDate.setMonth(today.getMonth() - 1);
    else if (salesFilter === '2m') cutoffDate.setMonth(today.getMonth() - 2);
    else if (salesFilter === '3m') cutoffDate.setMonth(today.getMonth() - 3);

    return inventory.map(item => {
      // Find sales in the selected period for this item
      const itemSales = salesHistory.filter(sale => {
        if (sale.itemId !== item.id) return false;
        const saleDate = new Date(sale.date);
        return saleDate >= cutoffDate && saleDate <= today;
      });

      const totalSalesQty = itemSales.reduce((sum, sale) => sum + sale.quantity, 0);
      
      return {
        ...item,
        salesInPeriod: totalSalesQty
      };
    }).filter(item => {
      const isBelowMin = item.currentQuantity < item.minQuantity;
      const hasSales = item.salesInPeriod > 0;
      const isOrdered = orders.some(o => o.id === item.id);
      const isIgnored = ignored.some(i => i.id === item.id);
      
      return isBelowMin && hasSales && !isOrdered && !isIgnored;
    });
  }, [inventory, salesHistory, simulatedToday, salesFilter, orders, ignored]);

  // Process Orders (sorted desc, filtered)
  const processedOrders = useMemo(() => {
    let filtered = [...orders];
    if (showOnlyUnplaced) {
      filtered = filtered.filter(o => !o.placed);
    }
    const sorted = filtered.sort((a, b) => (b.placedAt || 0) - (a.placedAt || 0));
    if (ordersFilter === 'all') return sorted;
    const today = new Date(simulatedToday);
    return sorted.filter(item => {
      const itemDate = new Date(item.orderDate);
      const diffTime = today - itemDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (ordersFilter === '30d') return diffDays >= 0 && diffDays <= 30;
      if (ordersFilter === '60d') return diffDays >= 0 && diffDays <= 60;
      if (ordersFilter === '90d') return diffDays >= 0 && diffDays <= 90;
      return true;
    });
  }, [orders, ordersFilter, simulatedToday, showOnlyUnplaced]);

  // Process Ignored (sorted desc, filtered)
  const processedIgnored = useMemo(() => {
    const sorted = [...ignored].sort((a, b) => (b.ignoredAt || 0) - (a.ignoredAt || 0));
    if (ignoredFilter === 'all') return sorted;
    const today = new Date(simulatedToday);
    return sorted.filter(item => {
      const itemDate = new Date(item.ignoreDate);
      const diffTime = today - itemDate;
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      if (ignoredFilter === '30d') return diffDays >= 0 && diffDays <= 30;
      if (ignoredFilter === '60d') return diffDays >= 0 && diffDays <= 60;
      if (ignoredFilter === '90d') return diffDays >= 0 && diffDays <= 90;
      return true;
    });
  }, [ignored, ignoredFilter, simulatedToday]);

  // V2 - Group processed orders by dealer
  const ordersGroupedByDealer = useMemo(() => {
    const groups = {};
    processedOrders.forEach(order => {
      const dealer = order.dealer || 'Unassigned';
      if (!groups[dealer]) groups[dealer] = [];
      groups[dealer].push(order);
    });
    return groups;
  }, [processedOrders]);

  // Toggle dealer expand/collapse
  const toggleDealerExpand = (dealerName) => {
    setExpandedDealers(prev => ({
      ...prev,
      [dealerName]: !prev[dealerName]
    }));
  };

  // V2 - Copy dealer order text
  const copyDealerOrderText = (dealerName, items) => {
    const text = `${dealerName} Order:\n` + items.map(item => `- ${item.name}: ${item.quantityOrdered || Math.max(1, item.minQuantity - item.currentQuantity)} pcs`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDealer(dealerName);
      setTimeout(() => setCopiedDealer(null), 2000);
    }).catch(err => {
      console.error("Clipboard copy failed: ", err);
    });
  };

  const isV2 = currentPath === '/version2';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Routing Navbar */}
      <nav className="version-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="24" height="24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          <span style={{ fontWeight: 7, fontSize: '1.125rem', letterSpacing: '-0.025em' }}>InventoryHub</span>
        </div>
        <div className="version-nav-links">
          <button 
            className={`version-btn ${!isV2 ? 'active' : ''}`}
            onClick={() => navigateTo('/')}
          >
            Version 1: Classic
          </button>
          <button 
            className={`version-btn ${isV2 ? 'active' : ''}`}
            onClick={() => navigateTo('/version2')}
          >
            Version 2: Dealer & Qty
          </button>
        </div>
      </nav>

      <div className="app-container animate-fade-in" style={{ flex: 1 }}>
        <header className="header-section">
          <div>
            <h1>Stock Management {isV2 ? 'v2' : 'v1'}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {isV2 ? 'Dealer & Custom Quantity Restock Portal' : 'Intelligent Inventory & Sales Prototype'}
            </p>
          </div>
          
          <div className="controls-section glass-panel" style={{ padding: '0.75rem 1.5rem', border: 'none' }}>
            <div className="date-picker-group">
              <label htmlFor="simulated-today">Set 'Today' Date</label>
              <input 
                type="date" 
                id="simulated-today" 
                className="date-input"
                value={simulatedToday}
                onChange={handleDateChange}
              />
            </div>
          </div>
        </header>

        <nav className="nav-tabs glass-panel" style={{ padding: '0.5rem' }}>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Order Dashboard ({dashboardItems.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Order List ({orders.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'ignored' ? 'active' : ''}`}
            onClick={() => setActiveTab('ignored')}
          >
            Ignored Items ({ignored.length})
          </button>
        </nav>

        <main>
          {activeTab === 'dashboard' && (
            <div className="animate-fade-in">
              <div className="filters-bar">
                <h2 style={{ fontSize: '1.25rem' }}>Items Needing Restock</h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <select 
                    className="select-input"
                    value={salesFilter}
                    onChange={(e) => setSalesFilter(e.target.value)}
                  >
                    <option value="1w">Sales Filter: Last 1 Week</option>
                    <option value="1m">Sales Filter: Last 1 Month</option>
                    <option value="2m">Sales Filter: Last 2 Months</option>
                    <option value="3m">Sales Filter: Last 3 Months</option>
                  </select>

                  <div className="view-toggle glass-panel" style={{ display: 'flex', padding: '0.25rem', border: 'none', gap: '0.25rem' }}>
                    <button 
                      className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setViewMode('grid')}
                      style={{
                        background: viewMode === 'grid' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: 'none',
                        color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Grid View"
                    >
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>
                    </button>
                    <button 
                      className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setViewMode('list')}
                      style={{
                        background: viewMode === 'list' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: 'none',
                        color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="List View"
                    >
                      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M4 15h16v-2H4v2zm0 4h16v-2H4v2zm0-8h16V9H4v2zm0-6v2h16V5H4z"/></svg>
                    </button>
                  </div>
                </div>
              </div>

              {dashboardItems.length === 0 ? (
                <div className="glass-panel empty-state">
                  <h3>All caught up!</h3>
                  <p>No items match the current criteria.</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="items-grid">
                  {dashboardItems.map(item => (
                    <div key={item.id} className="item-card glass-panel">
                      <div className="item-header">
                        <h3 className="item-title">{item.name}</h3>
                        <span className="status-badge status-critical">Low Stock</span>
                      </div>
                      
                      <div className="item-stats">
                        <div className="stat-block">
                          <span className="stat-label">Current Qty</span>
                          <span className="stat-value danger">{item.currentQuantity}</span>
                        </div>
                        <div className="stat-block">
                          <span className="stat-label">Min Stock</span>
                          <span className="stat-value">{item.minQuantity}</span>
                        </div>
                      </div>
                      
                      <div className="sales-info">
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                        <span>Sold <span className="sales-count">{item.salesInPeriod}</span> pieces in selected period</span>
                      </div>

                      <div className="card-actions">
                        <button className="btn btn-primary" onClick={() => isV2 ? initiateOrderV2(item) : placeOrderV1(item)}>
                          Add to Order List
                        </button>
                        <button className="btn btn-secondary" onClick={() => ignoreItem(item)}>
                          Later
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="list-container">
                  {dashboardItems.map(item => (
                    <div key={item.id} className="list-item glass-panel animate-fade-in">
                      <div className="list-item-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <h3 className="item-title" style={{ fontSize: '1.05rem' }}>{item.name}</h3>
                          <span className="status-badge status-critical" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>Low Stock</span>
                        </div>
                        <div className="list-item-meta" style={{ marginTop: '0.25rem' }}>
                          <span>Min Stock: {item.minQuantity}</span>
                          <span style={{ color: '#fca5a5' }}>Current Qty: {item.currentQuantity}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                            Sold <span className="sales-count" style={{ color: 'var(--accent-primary)', fontWeight: 6 }}>{item.salesInPeriod}</span> pieces
                          </span>
                        </div>
                      </div>
                      <div className="card-actions" style={{ flex: 'none', marginTop: 0 }}>
                        <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => isV2 ? initiateOrderV2(item) : placeOrderV1(item)}>
                          Add to Order List
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => ignoreItem(item)}>
                          Later
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="animate-fade-in">
              <div className="filters-bar">
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <h2 style={{ fontSize: '1.25rem' }}>Order List</h2>
                  
                  {/* V2 Specific Dealer Group Toggler */}
                  {isV2 && (
                    <button 
                      className={`btn ${groupByDealers ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', borderRadius: '6px' }}
                      onClick={() => setGroupByDealers(!groupByDealers)}
                    >
                      {groupByDealers ? 'Showing: Grouped By Dealer' : 'Group By Dealer'}
                    </button>
                  )}

                  {/* Show Only Unplaced toggle checkbox */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input 
                      type="checkbox"
                      checked={showOnlyUnplaced}
                      onChange={(e) => setShowOnlyUnplaced(e.target.checked)}
                      style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                    />
                    Show Only Unplaced
                  </label>
                </div>

                <select 
                  className="select-input"
                  value={ordersFilter}
                  onChange={(e) => setOrdersFilter(e.target.value)}
                >
                  <option value="all">Filter: All Time</option>
                  <option value="30d">Filter: Last Month (30 Days)</option>
                  <option value="60d">Filter: Last 60 Days</option>
                  <option value="90d">Filter: Last 90 Days</option>
                </select>
              </div>

              {groupByDealers && isV2 ? (
                // Group by Dealer list view
                <div className="list-container">
                  {Object.keys(ordersGroupedByDealer).length === 0 ? (
                    <div className="glass-panel empty-state">
                      <h3>No orders found</h3>
                      <p>Orders will show here once placed with a dealer.</p>
                    </div>
                  ) : (
                    Object.entries(ordersGroupedByDealer).map(([dealerName, dealerOrders]) => {
                      const isExpanded = !!expandedDealers[dealerName];
                      const hasUnplaced = dealerOrders.some(o => !o.placed);
                      return (
                        <div key={dealerName} className="dealer-group glass-panel">
                          <div 
                            className="dealer-header"
                            onClick={() => toggleDealerExpand(dealerName)}
                          >
                            <div className="dealer-header-title">
                              <svg 
                                width="16" 
                                height="16" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                                style={{ 
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s'
                                }}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                              <h3 style={{ fontSize: '1rem', color: '#fff' }}>{dealerName}</h3>
                              <span className="dealer-badge">{dealerOrders.length} items</span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              {hasUnplaced ? (
                                <button 
                                  className="btn btn-success" 
                                  style={{ flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markDealerAsPlaced(dealerName);
                                  }}
                                >
                                  Place Order
                                </button>
                              ) : (
                                <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)', textTransform: 'none' }}>
                                  All Placed
                                </span>
                              )}

                              <button 
                                className="btn btn-secondary" 
                                style={{ flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyDealerOrderText(dealerName, dealerOrders);
                                }}
                              >
                                {copiedDealer === dealerName ? 'Copied!' : 'Copy Order Text'}
                              </button>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="dealer-items-list animate-fade-in">
                              {dealerOrders.map(item => (
                                <div key={item.id} className="dealer-item-row">
                                  <span className="dealer-item-name">{item.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                      Min: {item.minQuantity} | Cur: {item.currentQuantity}
                                    </span>
                                    <span className="dealer-item-qty" style={{ marginRight: '1rem' }}>{item.quantityOrdered} pcs</span>
                                    {item.placed ? (
                                      <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                                        Placed
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                                          Pending
                                        </span>
                                        <button 
                                          className="btn btn-primary" 
                                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', borderRadius: '4px' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markAsPlaced(item.id);
                                          }}
                                        >
                                          Place
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                // Standard order history listing
                processedOrders.length === 0 ? (
                  <div className="glass-panel empty-state">
                    <h3>No orders yet</h3>
                    <p>No orders match the current criteria.</p>
                  </div>
                ) : (
                  <div className="list-container">
                    {processedOrders.map(item => (
                      <div key={item.id} className="list-item glass-panel">
                        <div className="list-item-info">
                          <h3 className="item-title" style={{ fontSize: '1rem' }}>{item.name}</h3>
                          <div className="list-item-meta">
                            <span>Min: {item.minQuantity}</span>
                            <span style={{ color: '#fca5a5' }}>Current: {item.currentQuantity}</span>
                            <span style={{ color: 'var(--accent-primary)', fontWeight: 6 }}>Ordered: {item.quantityOrdered || Math.max(1, item.minQuantity - item.currentQuantity)} pcs</span>
                            {isV2 && <span style={{ color: 'var(--accent-secondary)' }}>Dealer: {item.dealer || 'None'}</span>}
                            <span style={{ color: 'var(--success)' }}>Ordered on: {formatDate(item.orderDate)}</span>
                          </div>
                        </div>
                        {item.placed ? (
                          <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            Order Placed
                          </span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                              Pending
                            </span>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', flex: 'none' }}
                              onClick={() => markAsPlaced(item.id)}
                            >
                              Place Order
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'ignored' && (
            <div className="animate-fade-in">
              <div className="filters-bar">
                <h2 style={{ fontSize: '1.25rem' }}>Ignored Items</h2>
                <select 
                  className="select-input"
                  value={ignoredFilter}
                  onChange={(e) => setIgnoredFilter(e.target.value)}
                >
                  <option value="all">Filter: All Time</option>
                  <option value="30d">Filter: Last Month (30 Days)</option>
                  <option value="60d">Filter: Last 60 Days</option>
                  <option value="90d">Filter: Last 90 Days</option>
                </select>
              </div>
              {processedIgnored.length === 0 ? (
                <div className="glass-panel empty-state">
                  <h3>No ignored items</h3>
                  <p>No ignored items match the current criteria.</p>
                </div>
              ) : (
                <div className="list-container">
                  {processedIgnored.map(item => (
                    <div key={item.id} className="list-item glass-panel">
                      <div className="list-item-info">
                        <h3 className="item-title" style={{ fontSize: '1rem' }}>{item.name}</h3>
                        <div className="list-item-meta">
                          <span>Min: {item.minQuantity}</span>
                          <span style={{ color: '#fca5a5' }}>Current: {item.currentQuantity}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>Ignored on: {formatDate(item.ignoreDate)}</span>
                        </div>
                      </div>
                      <button 
                        className="btn btn-success" 
                        style={{ flex: 'none', padding: '0.5rem 1rem' }} 
                        onClick={() => isV2 ? initiateOrderV2(item) : placeOrderV1(item)}
                      >
                        Add to Order List
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Confirmation Modal overlay (V2 specific) */}
      {isV2 && orderModalItem && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel animate-fade-in" style={{ background: '#1e293b' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fff' }}>Configure Order</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
              Item: <span style={{ color: '#fff', fontWeight: 6 }}>{orderModalItem.name}</span>
            </p>
            <div style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' }}>
              <span>Current Stock: {orderModalItem.currentQuantity}</span>
              <span>Min Limit: {orderModalItem.minQuantity}</span>
            </div>

            <div className="form-group">
              <label htmlFor="modal-qty">Quantity to Order (pieces)</label>
              <input 
                type="number" 
                id="modal-qty"
                className="form-input" 
                value={orderQuantityInput}
                min="1"
                onChange={(e) => setOrderQuantityInput(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="modal-dealer">Select Textile Dealer</label>
              <select 
                id="modal-dealer"
                className="form-input"
                value={orderDealerInput}
                onChange={(e) => setOrderDealerInput(e.target.value)}
              >
                {DEALERS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="card-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={confirmOrderV2}>
                Confirm Order
              </button>
              <button className="btn btn-secondary" onClick={() => setOrderModalItem(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
