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

  // Gemini API & OCR State
  const [geminiApiKey, setGeminiApiKey] = useState(() => import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '');
  const [geminiPrompt, setGeminiPrompt] = useState(() => localStorage.getItem('gemini_prompt') || 'Identify all product names and their corresponding quantities from this image. Return the output strictly in the following JSON array format: [ { "name": "ITEM_NAME_HERE", "qty": 12 }, ... ]');
  const [analysisState, setAnalysisState] = useState({
    status: 'idle', // 'idle', 'analyzing', 'success', 'error'
    imageSrc: null,
    extractedItems: [], // array of processed extraction objects
    rawResponse: '', // raw text returned by Gemini API for debugging
    errorMsg: ''
  });
  const [showApiSettings, setShowApiSettings] = useState(true);
  const [toast, setToast] = useState(null);
  const [managementSearch, setManagementSearch] = useState('');

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem('gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    localStorage.setItem('gemini_prompt', geminiPrompt);
  }, [geminiPrompt]);

  // Auto-clear toast notices after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const resetAnalysis = () => {
    setAnalysisState({
      status: 'idle',
      imageSrc: null,
      extractedItems: [],
      rawResponse: '',
      errorMsg: ''
    });
  };

  // Version 2 Modal & Actions State
  const [orderModalItem, setOrderModalItem] = useState(null);
  const [orderQuantityInput, setOrderQuantityInput] = useState('');
  const [orderDealerInput, setOrderDealerInput] = useState('');
  const [groupByDealers, setGroupByDealers] = useState(false);

  // Variant Grouping States
  const [variantModalGroup, setVariantModalGroup] = useState([]);
  const [variantOrderQuantities, setVariantOrderQuantities] = useState({});
  const [variantOrderDealers, setVariantOrderDealers] = useState({});
  const [variantBaseName, setVariantBaseName] = useState('');
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

  // Dynamic metrics helpers for Item Management
  const getSalesStats = (item) => {
    const itemSales = salesHistory.filter(s => s.itemId === item.id);
    if (itemSales.length === 0) {
      return { totalQty: 0, count: 0, lastDate: 'N/A' };
    }
    const totalQty = itemSales.reduce((sum, s) => sum + s.quantity, 0);
    // Find the latest sale date
    const lastDate = itemSales.reduce((latest, current) => {
      return new Date(current.date) > new Date(latest.date) ? current.date : latest;
    }, itemSales[0].date);
    return {
      totalQty,
      count: itemSales.length,
      lastDate: formatDate(lastDate)
    };
  };

  const getLastPurchasedInfo = (item) => {
    // Look for placed orders
    const itemOrders = orders.filter(o => o.id === item.id && o.placed);
    if (itemOrders.length > 0) {
      // Find latest placed order
      const latest = itemOrders.reduce((latest, current) => {
        return (current.placedAt || 0) > (latest.placedAt || 0) ? current : latest;
      });
      return {
        date: formatDate(latest.orderDate),
        quantity: latest.quantityOrdered,
        dealer: latest.dealer
      };
    }
    // Consistent fallback mock data based on item index so the table isn't empty
    const idNum = parseInt(item.id.replace('item-', '') || '0', 10);
    const fallbackDate = new Date(simulatedToday);
    fallbackDate.setDate(fallbackDate.getDate() - (idNum % 20 + 5)); // 5-25 days ago
    const fallbackQty = (idNum % 5 + 1) * 10;
    return {
      date: formatDate(fallbackDate.toISOString()),
      quantity: fallbackQty,
      dealer: DEALERS[idNum % DEALERS.length]
    };
  };

  // Combined Jaccard (word overlap) and Levenshtein similarity index
  const getSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (s1 === s2) return 1.0;
    
    // Word overlap (Jaccard-like score for names)
    const words1 = s1.split(/\s+/).filter(Boolean);
    const words2 = s2.split(/\s+/).filter(Boolean);
    const commonWords = words1.filter(w => words2.includes(w));
    const overlap = commonWords.length / Math.max(words1.length, words2.length);
    
    // Levenshtein distance fallback
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= s2.length; j += 1) {
      for (let i = 1; i <= s1.length; i += 1) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    const distance = track[s2.length][s1.length];
    const levSim = 1 - distance / Math.max(s1.length, s2.length);
    
    return Math.max(overlap, levSim);
  };

  // OCR/VQA Analysis Execution
  const runOCRAnalysis = async (base64Image, filename) => {
    setAnalysisState(prev => ({ ...prev, status: 'analyzing', errorMsg: '' }));

    if (!geminiApiKey.trim()) {
      setAnalysisState(prev => ({
        ...prev,
        status: 'error',
        errorMsg: 'Gemini API Key is required! Please enter it in the settings panel.'
      }));
      showToast('API Key Required', 'error');
      return;
    }

    try {
      const mimeType = base64Image.match(/data:([^;]+);base64,/)?.[1] || 'image/png';
      const base64Data = base64Image.includes(';base64,') 
        ? base64Image.split(';base64,')[1] 
        : base64Image;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey.trim()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: geminiPrompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }]
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status}. ${errText.slice(0, 100)}`);
      }

      const res = await response.json();
      const text = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Store the raw text immediately in the state so it is accessible for debugging
      setAnalysisState(prev => ({ ...prev, rawResponse: text }));
      
      if (!text.trim()) {
        throw new Error("Gemini returned an empty response.");
      }

      let extractedItems = [];
      try {
        const cleanedText = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanedText);
        if (Array.isArray(parsed)) {
          extractedItems = parsed;
        } else if (parsed && typeof parsed === 'object') {
          extractedItems = [parsed];
        }
      } catch (e) {
        console.log("Failed parsing Gemini JSON, doing line-by-line fallback...", text);
        const lines = text.split('\n').filter(Boolean);
        lines.forEach(line => {
          const numbers = line.match(/\d+/);
          const qty = numbers ? parseInt(numbers[0], 10) : 1;
          const name = line.replace(/\d+/g, '').replace(/[^a-zA-Z\s]/g, '').trim();
          if (name.length > 2) {
            extractedItems.push({ name, qty });
          }
        });
      }

      if (extractedItems.length === 0) {
        throw new Error("No items could be extracted from this image. Please adjust your prompt/instruction.");
      }

      processAnalysisSuccess(extractedItems);
    } catch (error) {
      console.error("Gemini API failed:", error);
      setAnalysisState(prev => ({
        ...prev,
        status: 'error',
        errorMsg: error.message || 'API request failed. Please check your key or try again.'
      }));
      showToast(error.message || 'Gemini Inference Failed', 'error');
    }
  };

  const processAnalysisSuccess = (rawItems) => {
    const processed = rawItems.map((raw, index) => {
      const cleanedName = (raw.name || 'UNKNOWN ITEM').trim().toUpperCase();
      const qty = parseInt(raw.qty, 10) || 1;
      
      // Find closest match in inventory
      let bestMatch = null;
      let highestScore = 0;
      
      inventory.forEach(item => {
        const score = getSimilarity(cleanedName, item.name);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = item;
        }
      });

      const isMatch = highestScore >= 0.6;
      
      return {
        id: `extracted-${index}`,
        extractedName: cleanedName,
        extractedQty: qty,
        matchedItem: isMatch ? bestMatch : null,
        matchScore: highestScore,
        status: isMatch ? 'matched' : 'new',
        linkItemId: '',
        newItemMinQty: '10'
      };
    });

    setAnalysisState(prev => ({
      ...prev,
      status: 'success',
      extractedItems: processed
    }));

    showToast(`Analyzed successfully. Extracted ${processed.length} items.`);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAnalysisState(prev => ({
        ...prev,
        imageSrc: reader.result,
        status: 'idle',
        extractedItems: []
      }));
      runOCRAnalysis(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setAnalysisState(prev => ({
        ...prev,
        imageSrc: reader.result,
        status: 'idle',
        extractedItems: []
      }));
      runOCRAnalysis(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  };

  // Stock Action Handlers
  const updateExtractedItemField = (id, field, value) => {
    setAnalysisState(prev => ({
      ...prev,
      extractedItems: prev.extractedItems.map(item => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    }));
  };

  const applyStockUpdates = () => {
    const items = analysisState.extractedItems;
    if (!items || items.length === 0) return;

    let updatedInventory = [...inventory];
    let matchedCount = 0;
    let newCount = 0;

    items.forEach(item => {
      if (item.status === 'matched' && item.matchedItem) {
        updatedInventory = updatedInventory.map(invItem => {
          if (invItem.id === item.matchedItem.id) {
            return {
              ...invItem,
              currentQuantity: invItem.currentQuantity + item.extractedQty
            };
          }
          return invItem;
        });
        matchedCount++;
      } else if (item.status === 'linked' && item.linkItemId) {
        updatedInventory = updatedInventory.map(invItem => {
          if (invItem.id === item.linkItemId) {
            return {
              ...invItem,
              currentQuantity: invItem.currentQuantity + item.extractedQty
            };
          }
          return invItem;
        });
        matchedCount++;
      } else if (item.status === 'new') {
        const nameUpper = item.extractedName.trim().toUpperCase();
        if (nameUpper) {
          // If name already exists in catalog, merge it instead
          const dupItem = updatedInventory.find(i => i.name === nameUpper);
          if (dupItem) {
            updatedInventory = updatedInventory.map(invItem => {
              if (invItem.id === dupItem.id) {
                return {
                  ...invItem,
                  currentQuantity: invItem.currentQuantity + item.extractedQty
                };
              }
              return invItem;
            });
            matchedCount++;
          } else {
            const newItem = {
              id: `item-${updatedInventory.length}`,
              name: nameUpper,
              minQuantity: parseInt(item.newItemMinQty, 10) || 10,
              currentQuantity: item.extractedQty
            };
            updatedInventory.push(newItem);
            newCount++;
          }
        }
      }
    });

    setInventory(updatedInventory);
    showToast(`Successfully applied updates! Restocked ${matchedCount} items and created ${newCount} new catalog items.`);
    resetAnalysis();
  };

  // Direct manual stock update in the management table
  const handleManualStockChange = (itemId, newQty) => {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 0) return;
    setInventory(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, currentQuantity: qty };
      }
      return item;
    }));
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

  const downloadPurchaseOrderPDF = (dealerName, items) => {
    const userNote = prompt("Enter a custom note/remark to print on the Purchase Order (optional):", "") || "";
    
    const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const dateFormatted = new Date().toLocaleString();
    
    const tableRows = items.map((item, idx) => {
      const qty = item.quantityOrdered || Math.max(1, item.minQuantity - item.currentQuantity);

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.name}</td>
          <td style="text-align: center;">${qty} pcs</td>
        </tr>
      `;
    }).join('');

    const poHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order ${poNumber}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 40px;
            font-size: 14px;
            line-height: 1.6;
          }
          .po-container {
            max-width: 800px;
            margin: 0 auto;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .header-table td {
            vertical-align: top;
          }
          .company-logo {
            font-size: 24px;
            font-weight: bold;
            color: #1e3a8a;
            letter-spacing: -0.5px;
          }
          .document-title {
            font-size: 28px;
            font-weight: bold;
            text-align: right;
            color: #4b5563;
            margin: 0;
          }
          .meta-info {
            text-align: right;
            font-size: 13px;
            color: #6b7280;
            margin-top: 5px;
          }
          .address-section {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          .address-section td {
            width: 50%;
            vertical-align: top;
            padding: 15px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
          }
          .address-section td:first-child {
            border-right: none;
          }
          .address-title {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            color: #9ca3af;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
          }
          .address-name {
            font-size: 15px;
            font-weight: bold;
            color: #111827;
            margin-bottom: 4px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          .items-table th {
            background: #1e3a8a;
            color: #ffffff;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
            padding: 10px 12px;
            text-align: left;
            letter-spacing: 0.5px;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            color: #374151;
          }
          .items-table tr:nth-child(even) {
            background: #f9fafb;
          }
          .footer {
            margin-top: 60px;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
            text-align: center;
            font-size: 12px;
            color: #9ca3af;
          }
          .signature-section {
            width: 100%;
            margin-top: 40px;
            border-collapse: collapse;
          }
          .signature-section td {
            text-align: right;
            padding-top: 50px;
          }
          .signature-line {
            width: 40%;
            border-top: 1px solid #9ca3af;
            margin-left: auto;
            margin-bottom: 5px;
          }
          @media print {
            body {
              padding: 0;
            }
            .po-container {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="po-container">
          <table class="header-table">
            <tr>
              <td>
                <div class="company-logo">K.R.J.</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Smart Warehousing Solutions</div>
              </td>
              <td>
                <h1 class="document-title">PURCHASE ORDER</h1>
                <div class="meta-info">
                  <strong>PO Number:</strong> ${poNumber}<br>
                  <strong>Date & Time:</strong> ${dateFormatted}
                </div>
              </td>
            </tr>
          </table>

          <table class="address-section">
            <tr>
              <td>
                <div class="address-title">From (Billing & Shipping)</div>
                <div class="address-name">K.R.J.</div>
                <div>456 Warehouse Boulevard, Suite A</div>
                <div>Logistics Center, LC 90210</div>
                <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                  <strong>Phone:</strong> +1-555-0100 &nbsp;|&nbsp; <strong>Email:</strong> orders@krj-depot.com
                </div>
              </td>
              <td style="border-left: none;">
                <div class="address-title">To (Supplier/Dealer)</div>
                <div class="address-name">${dealerName}</div>
                <div>100 Textile Way, Mill Area</div>
                <div>Industrial Sector, IS 54321</div>
                <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                  <strong>Phone:</strong> +1-555-0199 &nbsp;|&nbsp; <strong>Email:</strong> contact@${dealerName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com
                </div>
              </td>
            </tr>
          </table>

          <table class="items-table" style="width:100%; border-collapse:collapse; margin-bottom:30px;">
            <thead>
              <tr>
                <th style="width: 50px;">#</th>
                <th>Item Description</th>
                <th style="width: 150px; text-align: center;">Qty Ordered</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div style="margin-top: 30px; margin-bottom: 30px;">
            <h4 style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">Notes / Remarks:</h4>
            <div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; background: #f9fafb; min-height: 60px; font-size: 13px;">
              ${userNote ? userNote.replace(/\n/g, '<br>') : '<span style="color: #9ca3af; font-style: italic;">[ Write notes or instructions here... ]</span>'}
            </div>
          </div>

          <table class="signature-section">
            <tr>
              <td>
                <div class="signature-line"></div>
                <div style="font-size: 12px; color: #6b7280; padding-right: 30px;">Authorized Signature</div>
              </td>
            </tr>
          </table>

          <div class="footer">
            Thank you for your business. Please direct all invoicing inquiries to accounts@krj-depot.com.
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (printWindow) {
      printWindow.document.write(poHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } else {
      alert('Popup blocker prevented opening the purchase order window. Please allow popups for this site.');
    }
  };

  const getLastSaleDate = (itemId) => {
    const itemSales = salesHistory.filter(s => s.itemId === itemId);
    if (itemSales.length === 0) return 'No sales recorded';
    const sorted = [...itemSales].sort((a, b) => new Date(b.date) - new Date(a.date));
    return new Date(sorted[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getSalesInPeriod = (item) => {
    const today = new Date(simulatedToday);
    const cutoffDate = new Date(today);
    if (salesFilter === '1w') cutoffDate.setDate(today.getDate() - 7);
    else if (salesFilter === '1m') cutoffDate.setMonth(today.getMonth() - 1);
    else if (salesFilter === '2m') cutoffDate.setMonth(today.getMonth() - 2);
    else if (salesFilter === '3m') cutoffDate.setMonth(today.getMonth() - 3);

    const itemSales = salesHistory.filter(sale => {
      if (sale.itemId !== item.id) return false;
      const saleDate = new Date(sale.date);
      return saleDate >= cutoffDate && saleDate <= today;
    });

    return itemSales.reduce((sum, sale) => sum + sale.quantity, 0);
  };

  const getBaseName = (name) => {
    let clean = name.trim().toUpperCase();
    clean = clean.replace(/\([^)]+\)/g, '');
    clean = clean.replace(/\b(XXXL|XXL|XL|L|M|S)\s*(SIZE|PC|10PC)?$/i, '');
    clean = clean.replace(/\b\d+(\/\d+)?\s*(CM|MTS?|MT|PCS?|FULL|HALF|SIZE)?$/i, '');
    clean = clean.replace(/\s+/g, ' ').trim();
    if (clean.length < 4) {
      const parts = name.split(/\s+/);
      return parts[0] || name;
    }
    return clean;
  };

  const handleInitiateOrder = (item) => {
    const baseName = getBaseName(item.name);
    const matches = inventory.filter(i => getBaseName(i.name) === baseName);
    
    if (matches.length > 1) {
      setVariantBaseName(baseName);
      setVariantModalGroup(matches);
      
      const initialQtys = {};
      const initialDealers = {};
      matches.forEach(m => {
        const suggestedQty = Math.max(0, m.minQuantity - m.currentQuantity);
        initialQtys[m.id] = suggestedQty > 0 ? suggestedQty.toString() : '0';
        initialDealers[m.id] = DEALERS[0];
      });
      setVariantOrderQuantities(initialQtys);
      setVariantOrderDealers(initialDealers);
    } else {
      if (isV2 || isV3) {
        initiateOrderV2(item);
      } else {
        placeOrderV1(item);
      }
    }
  };

  const placeBulkVariantOrders = () => {
    let newOrders = [...orders];
    let addedCount = 0;

    variantModalGroup.forEach(m => {
      const qtyStr = variantOrderQuantities[m.id];
      const qty = parseInt(qtyStr, 10) || 0;
      if (qty > 0) {
        const existingIdx = newOrders.findIndex(o => o.id === m.id);
        const orderData = {
          id: m.id,
          name: m.name,
          minQuantity: m.minQuantity,
          currentQuantity: m.currentQuantity,
          quantityOrdered: qty,
          dealer: (isV2 || isV3) ? variantOrderDealers[m.id] : undefined,
          orderDate: formatDate(new Date(simulatedToday)),
          placed: false,
          placedAt: null
        };

        if (existingIdx >= 0) {
          newOrders[existingIdx] = orderData;
        } else {
          newOrders.push(orderData);
        }
        addedCount++;
      }
    });

    if (addedCount === 0) {
      alert("Please specify a quantity greater than zero for at least one item.");
      return;
    }

    setOrders(newOrders);
    showToast(`Placed ${addedCount} variant orders successfully!`);
    setVariantModalGroup([]);
  };

  const isV3 = currentPath === '/version3';
  const isV2 = currentPath === '/version2';
  const isV1 = !isV2 && !isV3;

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
            className={`version-btn ${isV1 ? 'active' : ''}`}
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
          <button 
            className={`version-btn ${isV3 ? 'active' : ''}`}
            onClick={() => navigateTo('/version3')}
          >
            Version 3: Date Priority & PO
          </button>
        </div>
      </nav>

      <div className="app-container animate-fade-in" style={{ flex: 1 }}>
        <header className="header-section">
          <div>
            <h1>Stock Management {isV3 ? 'v3' : isV2 ? 'v2' : 'v1'}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {isV3 
                ? 'Time-Prioritized Restock Ledger & Automated Purchase Order Generation'
                : isV2 
                  ? 'Dealer & Custom Quantity Restock Portal' 
                  : 'Intelligent Inventory & Sales Prototype'}
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
          <button 
            className={`tab-btn ${activeTab === 'management' ? 'active' : ''}`}
            onClick={() => setActiveTab('management')}
          >
            Item Management ({inventory.length})
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
                    <div 
                      key={item.id} 
                      className="item-card glass-panel"
                      style={{ border: isV3 ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid var(--border-color)' }}
                    >
                      {isV3 && (
                        <div className="v3-date-header">
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          Last Sold: {getLastSaleDate(item.id)}
                        </div>
                      )}
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
                        <button className="btn btn-primary" onClick={() => handleInitiateOrder(item)}>
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
                    <div 
                      key={item.id} 
                      className="list-item glass-panel animate-fade-in"
                      style={{ 
                        border: isV3 ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid var(--border-color)',
                        flexDirection: isV3 ? 'column' : 'row',
                        alignItems: isV3 ? 'stretch' : 'center'
                      }}
                    >
                      {isV3 && (
                        <div className="v3-date-header" style={{ marginBottom: '0.5rem', width: 'fit-content' }}>
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          Last Sold: {getLastSaleDate(item.id)}
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
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
                          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => handleInitiateOrder(item)}>
                            Add to Order List
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={() => ignoreItem(item)}>
                            Later
                          </button>
                        </div>
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
                  
                  {/* V2/V3 Specific Dealer Group Toggler */}
                  {(isV2 || isV3) && (
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

              {groupByDealers && (isV2 || isV3) ? (
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
                            
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                                {copiedDealer === dealerName ? 'Copied!' : 'Copy'}
                              </button>

                              <button 
                                className="btn btn-primary" 
                                style={{ flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'linear-gradient(135deg, var(--accent-secondary) 0%, #059669 100%)', border: 'none' }} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadPurchaseOrderPDF(dealerName, dealerOrders);
                                }}
                              >
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                PO PDF
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
                      <div 
                        key={item.id} 
                        className="list-item glass-panel"
                        style={{ 
                          border: isV3 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border-color)',
                          flexDirection: isV3 ? 'column' : 'row',
                          alignItems: isV3 ? 'stretch' : 'center'
                        }}
                      >
                        {isV3 && (
                          <div className="v3-date-header" style={{ marginBottom: '0.5rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#a7f3d0', width: 'fit-content' }}>
                            📅 Ordered: {formatDate(item.orderDate)} (Time: {new Date(item.placedAt || item.orderDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </div>
                        )}
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                          <div className="list-item-info">
                            <h3 className="item-title" style={{ fontSize: '1rem' }}>{item.name}</h3>
                            <div className="list-item-meta">
                              <span>Min: {item.minQuantity}</span>
                              <span style={{ color: '#fca5a5' }}>Current: {item.currentQuantity}</span>
                              <span style={{ color: 'var(--accent-primary)', fontWeight: 6 }}>Ordered: {item.quantityOrdered || Math.max(1, item.minQuantity - item.currentQuantity)} pcs</span>
                              {(isV2 || isV3) && <span style={{ color: 'var(--accent-secondary)' }}>Dealer: {item.dealer || 'None'}</span>}
                              {!isV3 && <span style={{ color: 'var(--success)' }}>Ordered on: {formatDate(item.orderDate)}</span>}
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
                    <div 
                      key={item.id} 
                      className="list-item glass-panel"
                      style={{ 
                        border: isV3 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-color)',
                        flexDirection: isV3 ? 'column' : 'row',
                        alignItems: isV3 ? 'stretch' : 'center'
                      }}
                    >
                      {isV3 && (
                        <div className="v3-date-header" style={{ marginBottom: '0.5rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#fca5a5', width: 'fit-content' }}>
                          📅 Ignored: {formatDate(item.ignoreDate)} (Time: {new Date(item.ignoredAt || item.ignoreDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                        </div>
                      )}
                      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div className="list-item-info">
                          <h3 className="item-title" style={{ fontSize: '1rem' }}>{item.name}</h3>
                          <div className="list-item-meta">
                            <span>Min: {item.minQuantity}</span>
                            <span style={{ color: '#fca5a5' }}>Current: {item.currentQuantity}</span>
                            {!isV3 && <span style={{ color: 'var(--text-secondary)' }}>Ignored on: {formatDate(item.ignoreDate)}</span>}
                          </div>
                        </div>
                        <button 
                          className="btn btn-success" 
                          style={{ flex: 'none', padding: '0.5rem 1rem' }} 
                          onClick={() => handleInitiateOrder(item)}
                        >
                          Add to Order List
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'management' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="management-grid">
                
                {/* Left Side: Upload & OCR Analysis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Gemini Settings Visibility Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.75rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px' }}
                      onClick={() => setShowApiSettings(!showApiSettings)}
                    >
                      {showApiSettings ? '👁️ Hide API Settings' : '👁️ Show API Settings'}
                    </button>
                  </div>

                  {/* Gemini Settings Panel */}
                  {showApiSettings && (
                    <div className="glass-panel api-settings">
                      <h3 style={{ fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Gemini API & Prompt Configuration
                      </h3>
                      
                      <div className="form-group" style={{ marginTop: '0.25rem' }}>
                        <label htmlFor="gemini-key-input" style={{ fontSize: '0.75rem' }}>Gemini API Key</label>
                        <input 
                          type="password" 
                          id="gemini-key-input"
                          className="form-input"
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                          placeholder="AIzaSy..."
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="gemini-prompt-input" style={{ fontSize: '0.75rem' }}>Custom Instruction / Prompt</label>
                        <textarea 
                          id="gemini-prompt-input"
                          className="form-input"
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', minHeight: '80px' }}
                          rows="3"
                          placeholder="Add some query instruction..."
                          value={geminiPrompt}
                          onChange={(e) => setGeminiPrompt(e.target.value)}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          Tailor the prompt instructions to guide the <code>gemini-3.1-flash-lite</code> model.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Image Analyzer Card */}
                  <div className="glass-panel upload-card">
                    <h2 style={{ fontSize: '1.15rem', color: '#fff' }}>OCR Stock Analyzer</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '-0.75rem' }}>
                      Upload a stock label, receipt or ticket to automatically parse details.
                    </p>

                    {/* Drag and Drop Zone */}
                    <div 
                      className="upload-zone"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('stock-image-file').click()}
                    >
                      <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      <span className="upload-zone-text">Drag & Drop Image or Click to Browse</span>
                      <input 
                        type="file" 
                        id="stock-image-file" 
                        accept="image/*" 
                        style={{ display: 'none' }}
                        onChange={handleImageUpload}
                      />
                    </div>

                    {/* Image Preview */}
                    {analysisState.imageSrc && (
                      <div className="image-preview-container">
                        <img src={analysisState.imageSrc} alt="Preview" className="image-preview" />
                      </div>
                    )}

                    {/* Analysis Status */}
                    {analysisState.status === 'analyzing' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        <span className="spinner"></span>
                        <span style={{ fontSize: '0.85rem' }}>Analyzing stock image...</span>
                      </div>
                    )}

                    {analysisState.status === 'error' && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', color: '#fca5a5' }}>
                        <strong>Analysis Failed:</strong> {analysisState.errorMsg}
                      </div>
                    )}

                    {/* Extraction Results Panels */}
                    {analysisState.status === 'success' && (
                      <div className="analysis-results animate-fade-in" style={{ gap: '1.25rem' }}>
                        <h3 style={{ fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                          Extracted Items ({analysisState.extractedItems.length})
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                          {analysisState.extractedItems.map((item) => {
                            return (
                              <div key={item.id} className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <strong style={{ color: '#fff' }}>{item.extractedName}</strong>
                                  <span style={{ fontWeight: 6, color: 'var(--accent-primary)', fontSize: '0.95rem' }}>
                                    Qty: {item.extractedQty}
                                  </span>
                                </div>

                                {/* Status / Operation Toggle */}
                                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                  <button 
                                    className={`btn ${item.status === 'matched' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', flex: 1 }}
                                    onClick={() => updateExtractedItemField(item.id, 'status', 'matched')}
                                    disabled={!item.matchedItem}
                                  >
                                    Match
                                  </button>
                                  <button 
                                    className={`btn ${item.status === 'linked' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', flex: 1 }}
                                    onClick={() => updateExtractedItemField(item.id, 'status', 'linked')}
                                  >
                                    Link
                                  </button>
                                  <button 
                                    className={`btn ${item.status === 'new' ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', flex: 1 }}
                                    onClick={() => updateExtractedItemField(item.id, 'status', 'new')}
                                  >
                                    New Item
                                  </button>
                                </div>

                                {/* Status specific inputs */}
                                {item.status === 'matched' && item.matchedItem && (
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <div className="result-badge match" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', marginBottom: '0.35rem' }}>
                                      Match: {Math.round(item.matchScore * 100)}% Similarity
                                    </div>
                                    <div>Catalog: <strong style={{ color: '#fff' }}>{item.matchedItem.name}</strong></div>
                                    <div>Current: {item.matchedItem.currentQuantity} &rarr; <strong style={{ color: 'var(--success)' }}>{item.matchedItem.currentQuantity + item.extractedQty}</strong></div>
                                  </div>
                                )}

                                {item.status === 'linked' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <select
                                      className="select-input"
                                      style={{ width: '100%', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                      value={item.linkItemId}
                                      onChange={(e) => updateExtractedItemField(item.id, 'linkItemId', e.target.value)}
                                    >
                                      <option value="">-- Choose Existing Item --</option>
                                      {inventory.map(inv => (
                                        <option key={inv.id} value={inv.id}>{inv.name} (Qty: {inv.currentQuantity})</option>
                                      ))}
                                    </select>
                                    {item.linkItemId && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Current: {inventory.find(i => i.id === item.linkItemId)?.currentQuantity || 0} &rarr; <strong style={{ color: 'var(--success)' }}>{(inventory.find(i => i.id === item.linkItemId)?.currentQuantity || 0) + item.extractedQty}</strong>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {item.status === 'new' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div className="result-badge new" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', marginBottom: '0.1rem' }}>
                                      Will Add as New Catalog Entry
                                    </div>
                                    <div className="form-group">
                                      <label style={{ fontSize: '0.7rem' }}>Item Catalog Name</label>
                                      <input 
                                        type="text" 
                                        className="form-input" 
                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                        value={item.extractedName}
                                        onChange={(e) => updateExtractedItemField(item.id, 'extractedName', e.target.value)}
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label style={{ fontSize: '0.7rem' }}>Min Stock Limit</label>
                                      <input 
                                        type="number" 
                                        className="form-input" 
                                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                        value={item.newItemMinQty}
                                        onChange={(e) => updateExtractedItemField(item.id, 'newItemMinQty', e.target.value)}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="card-actions" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-success" onClick={applyStockUpdates} style={{ flex: 2 }}>
                            Apply All Stock Updates
                          </button>
                          <button className="btn btn-secondary" onClick={resetAnalysis} style={{ flex: 1 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Raw response debugging details */}
                    {analysisState.rawResponse && (
                      <details className="glass-panel" style={{ marginTop: '1rem', padding: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 5, userSelect: 'none' }}>
                          Show Raw Gemini API Response
                        </summary>
                        <pre style={{ 
                          fontSize: '0.75rem', 
                          overflowX: 'auto', 
                          whiteSpace: 'pre-wrap', 
                          marginTop: '0.5rem', 
                          maxHeight: '180px', 
                          color: '#a5f3fc', 
                          background: 'rgba(0,0,0,0.25)', 
                          padding: '0.6rem', 
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.03)',
                          fontFamily: 'monospace'
                        }}>
                          {analysisState.rawResponse}
                        </pre>
                      </details>
                    )}

                  </div>
                </div>

                {/* Right Side: Advanced Stock List & Sales Data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="filters-bar" style={{ marginBottom: 0 }}>
                    <h2 style={{ fontSize: '1.25rem', color: '#fff' }}>Detailed Stock & Sales Ledger</h2>
                    <div className="search-input-container" style={{ maxWidth: '320px' }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      <input 
                        type="text" 
                        className="search-input"
                        placeholder="Search items..." 
                        value={managementSearch}
                        onChange={(e) => setManagementSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="management-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th style={{ width: '180px' }}>Current Stock</th>
                          <th>Min Qty</th>
                          <th>Last Purchased</th>
                          <th>Sales Metrics</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory
                          .filter(item => item.name.toLowerCase().includes(managementSearch.toLowerCase()))
                          .map(item => {
                            const isBelowMin = item.currentQuantity < item.minQuantity;
                            const percentage = Math.min(100, Math.round((item.currentQuantity / item.minQuantity) * 100));
                            const barColor = isBelowMin ? 'var(--danger)' : 'var(--success)';
                            const sales = getSalesStats(item);
                            const purchased = getLastPurchasedInfo(item);

                            return (
                              <tr key={item.id}>
                                <td>
                                  <div style={{ fontWeight: 6, color: '#fff' }}>{item.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    ID: {item.id}
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <input 
                                        type="number"
                                        className="date-input"
                                        style={{ width: '65px', padding: '0.2rem 0.4rem', textAlign: 'center', fontSize: '0.85rem' }}
                                        value={item.currentQuantity}
                                        onChange={(e) => handleManualStockChange(item.id, e.target.value)}
                                      />
                                      {isBelowMin && (
                                        <span className="status-badge status-critical" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>
                                          Low
                                        </span>
                                      )}
                                    </div>
                                    <div className="stock-progress-container">
                                      <div className="stock-progress-bar">
                                        <div 
                                          className="stock-progress-fill" 
                                          style={{ width: `${percentage}%`, backgroundColor: barColor }}
                                        ></div>
                                      </div>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{percentage}%</span>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontWeight: 5 }}>{item.minQuantity}</span>
                                </td>
                                <td>
                                   <div style={{ 
                                     fontSize: '0.8rem',
                                     border: isV3 ? '1px dashed rgba(59, 130, 246, 0.4)' : 'none',
                                     background: isV3 ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                     padding: isV3 ? '0.4rem' : '0',
                                     borderRadius: isV3 ? '6px' : '0'
                                   }}>
                                     <div><strong>{purchased.quantity} pcs</strong></div>
                                     <div style={{ 
                                       color: isV3 ? '#60a5fa' : 'var(--text-secondary)', 
                                       fontSize: '0.75rem', 
                                       marginTop: '0.15rem',
                                       fontWeight: isV3 ? 'bold' : 'normal',
                                       display: 'flex',
                                       alignItems: 'center',
                                       gap: '0.2rem'
                                     }}>
                                       {isV3 && <span>📅</span>} {purchased.date}
                                     </div>
                                     <div style={{ color: 'var(--accent-secondary)', fontSize: '0.7rem' }}>
                                       {purchased.dealer}
                                     </div>
                                   </div>
                                 </td>
                                 <td>
                                   <div style={{ fontSize: '0.8rem' }}>
                                     <div>Units Sold: <strong style={{ color: 'var(--accent-primary)' }}>{sales.totalQty}</strong></div>
                                     <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                       Orders: {sales.count}
                                     </div>
                                     <div style={{ 
                                       color: isV3 ? '#60a5fa' : 'var(--text-secondary)', 
                                       fontSize: '0.75rem',
                                       fontWeight: isV3 ? 'bold' : 'normal',
                                       display: 'flex',
                                       alignItems: 'center',
                                       gap: '0.2rem'
                                     }}>
                                       {isV3 && <span>🛒</span>} Last Sold: {sales.lastDate}
                                     </div>
                                   </div>
                                 </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>
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

      {/* Variant Restock Portal Modal (All Versions) */}
      {variantModalGroup.length > 0 && (
        <div className="modal-backdrop" style={{ zIndex: 1010 }}>
          <div className="modal-content glass-panel animate-fade-in" style={{ background: '#1e293b', maxWidth: '680px', width: '90%' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" fill="none" stroke="var(--accent-primary)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              Bulk Variant Order Portal
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
              Grouping items matching: <strong style={{ color: '#fff' }}>{variantBaseName}</strong>
            </p>

            <div style={{ maxHeight: '350px', overflowY: 'auto', margin: '1rem 0', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(0,0,0,0.15)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Variant Name</th>
                    <th style={{ padding: '0.75rem 1rem', width: '110px' }}>Stock Status</th>
                    <th style={{ padding: '0.75rem 1rem', width: '110px' }}>Sales ({salesFilter})</th>
                    {(isV2 || isV3) && <th style={{ padding: '0.75rem 1rem', width: '150px' }}>Textile Dealer</th>}
                    <th style={{ padding: '0.75rem 1rem', width: '90px' }}>Qty (pcs)</th>
                  </tr>
                </thead>
                <tbody>
                  {variantModalGroup.map(item => {
                    const isBelowMin = item.currentQuantity < item.minQuantity;
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 5, color: '#fff' }}>
                          {item.name}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ color: isBelowMin ? 'var(--danger)' : 'var(--success)' }}>
                            {item.currentQuantity} / {item.minQuantity}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--accent-primary)', fontWeight: 6 }}>
                          {getSalesInPeriod(item)} pcs
                        </td>
                        {(isV2 || isV3) && (
                          <td style={{ padding: '0.5rem 1rem' }}>
                            <select
                              className="select-input"
                              style={{ width: '100%', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              value={variantOrderDealers[item.id] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariantOrderDealers(prev => ({ ...prev, [item.id]: val }));
                              }}
                            >
                              {DEALERS.map(d => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        <td style={{ padding: '0.5rem 1rem' }}>
                          <input
                            type="number"
                            className="date-input"
                            style={{ width: '100%', padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.85rem' }}
                            value={variantOrderQuantities[item.id] || '0'}
                            min="0"
                            onChange={(e) => {
                              const val = e.target.value;
                              setVariantOrderQuantities(prev => ({ ...prev, [item.id]: val }));
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="card-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-success" onClick={placeBulkVariantOrders} style={{ flex: 2 }}>
                Confirm Variant Orders
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  const firstItem = variantModalGroup[0];
                  setVariantModalGroup([]);
                  if (isV2 || isV3) {
                    initiateOrderV2(firstItem);
                  } else {
                    placeOrderV1(firstItem);
                  }
                }}
                style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
              >
                Order Single Size Only
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setVariantModalGroup([])} 
                style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification overlay */}
      {toast && (
        <div className="toast-notification">
          {toast.type === 'success' ? (
            <svg width="20" height="20" fill="none" stroke="var(--success)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          ) : (
            <svg width="20" height="20" fill="none" stroke="var(--danger)" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          )}
          <span style={{ fontSize: '0.875rem', fontWeight: 5, color: '#fff' }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
