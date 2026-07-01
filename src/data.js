export const ITEMS = [
  "BEDSHEET GOVINDARAJA (APUR)",
  "BIT 4689 (1MT)",
  "BIT 4689 (80CM)",
  "BIT 4689 (BD) 80 CM",
  "BIT ANUPAMA 1 MTS",
  "BIT ANUPAMA 80 CM",
  "BIT MILLINIUM",
  "BIT MILLINIUM 1 MT",
  "BIT NAMOKAR",
  "BIT SILK COTTON 1 MTS",
  "CHUDITHAR PRANJUL",
  "CHUDITHAR PRANJUL XXXL",
  "CHUDITHAR SHIVANI",
  "CLUB PLAIN FULL 36 FULL",
  "CLUB PLAIN FULL 38 FULL",
  "CLUB PLAIN FULL 40 FULL",
  "CLUB PLAIN FULL 42 FULL",
  "CLUB PLAIN FULL 44 FULL",
  "CLUB PLAIN HALF 38 HALF",
  "CLUB PLAIN HALF 40 HALF",
  "CLUB PLAIN HALF 42 HALF",
  "CLUB PLAIN HALF 44 HALF",
  "CLUB PRINT FULL 40 FULL",
  "COTTON PANT GRIND UP",
  "COTTON PANT Q BALL (CUBE)",
  "COTTON SARE 2221 YASHIKA",
  "COTTON SARE 2295 SUJITHA",
  "COTTON SARE 9476 KT RED",
  "COTTON SARE CHEMBARUTHI CHECK",
  "COTTON SARE SHIVANGI",
  "COTTON SARE SILK COTTON",
  "COTTON SARE SNEHA BUTTA",
  "CYCLING SHORTS 75 CM",
  "CYCLING SHORTS 80 CM",
  "DHOTHY 4 MUZH 7001 GREEN",
  "DHOTHY 4 MUZH KAALA STYLE",
  "DHOTHY 4 MUZH KUMKI BLUE",
  "DHOTHY 4 MUZH KUMKI CEMENT",
  "DHOTHY 4 MUZH KUMKI D.KAVI",
  "DHOTHY 4 MUZH KUMKI GREEN",
  "DHOTHY 4 MUZH KUMKI KAVI",
  "DHOTHY 4 MUZH KUMKI L.KAVI",
  "DHOTHY 4 MUZH KUMKI MANGO",
  "DHOTHY 4 MUZH KUMKI MERUN",
  "DHOTHY 4 MUZH KUMKI ORANGE",
  "DHOTHY 4 MUZH KUMKI RED",
  "DHOTHY 4 MUZH KUMKI YELLOW",
  "DHOTHY 4 MUZH MERSAL",
  "DHOTHY 4 MUZH NANO",
  "DHOTHY 4 MUZH SUN L.KAVI",
  "DHOTHY 4 MUZH SUPREME DMK",
  "DHOTHY 8 MUZH MAYIL KAN",
  "DUPATTA JAPAN",
  "DUPATTA NAZMIN 2.25",
  "FANCY BLOUSE 200",
  "FANCY BLOUSE 2000 SERIAL",
  "FANCY BLOUSE 3000 SERIAL",
  "FANCY BLOUSE 11000 SERIAL",
  "FANCY BLOUSE 12000 SERIAL",
  "FOLDING SLIPS 75 CM",
  "FOLDING SLIPS 80 CM",
  "FOLDING SLIPS 85 CM",
  "G TRACK XL-XXL SIZE",
  "GT FULL PANT XL SIZE",
  "GT FULL PANT XXL SIZE",
  "GV 85 CM",
  "GV 90 CM",
  "GV 100 CM",
  "HEENA BRA 30/75",
  "HEENA BRA 32/80",
  "HEENA BRA 34/85",
  "HEENA BRA 36/90",
  "HEENA BRA 40/100",
  "HYBRID CHECKED FULL 38-42 CM",
  "IRUMUDI CASEMENT",
  "JOCKEY L 10PC",
  "JOCKEY M 10PC",
  "JOCKEY S 10PC",
  "JOCKEY XL 10PC",
  "KABADI SHORTS J S SIZE",
  "KABADI SHORTS J M SIZE",
  "KABADI SHORTS J L SIZE",
  "KABADI SHORTS J XL SIZE",
  "KABADI SHORTS J XXL SIZE",
  "KABADI SHORTS J XXXL SIZE",
  "KERCHIEF HAJI",
  "KERCHIEF MINISTER WHITE",
  "KERCHIEF NANDU",
  "KERCHIEF NO 300",
  "KERCHIEF NO 500",
  "KERCHIEF RAMZAN WHITE",
  "KERCHIEF ROJA",
  "LEGGINS ANKLE LEAF",
  "LEGGINS JAINAM XL",
  "LEGGINS JAINAM XXL",
  "LEGGINS LEAF",
  "LINING MIRAJ",
  "LITTLE STAR DELUXE BΟΥ",
  "LITTLE STAR HERO BOY",
  "LITTLE STAR HERO GIRL",
  "LITTLE STAR NICE GIRL",
  "LITTLE STAR NO 2 GIRLS",
  "LITTLE STAR RICH BOYS",
  "LITTLE STAR SMART BOYS",
  "LITTLE STAR STAR GIRLS",
  "LOVELY SHIMMY 60 CM",
  "LOVELY SHIMMY 65 CM",
  "LOVELY SHIMMY 70 CM",
  "LOYER LYCRA",
  "LOYER M SIZE",
  "LOYER XL SIZE",
  "LOYER XXL SIZE",
  "LOYER XXXL SIZE"
];

// Helper to get random int between min and max
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate inventory
export const generateInventory = () => {
  return ITEMS.map((item, index) => {
    // Generate a min quantity between 10 and 50
    const minQty = getRandomInt(10, 50);
    // Make ~70% of items below minimum quantity so there's plenty to order
    const isBelowMin = Math.random() < 0.7;
    const currentQty = isBelowMin ? getRandomInt(0, minQty - 1) : getRandomInt(minQty, minQty + 30);

    return {
      id: `item-${index}`,
      name: item,
      minQuantity: minQty,
      currentQuantity: currentQty
    };
  });
};

// Generate sales history for the past 90 days from the given simulatedToday date
export const generateSalesHistory = (inventory, simulatedToday) => {
  const sales = [];
  const today = new Date(simulatedToday);

  inventory.forEach(item => {
    // Each item has between 0 and 15 sales events in the past 90 days
    const numSales = getRandomInt(0, 15);

    for (let i = 0; i < numSales; i++) {
      // Random day in the last 90 days
      const daysAgo = getRandomInt(0, 90);
      const saleDate = new Date(today);
      saleDate.setDate(saleDate.getDate() - daysAgo);

      sales.push({
        id: `sale-${item.id}-${i}`,
        itemId: item.id,
        quantity: getRandomInt(1, 10), // Sold between 1 and 10 pieces in this transaction
        date: saleDate.toISOString()
      });
    }
  });

  return sales;
};

export const DEALERS = [
  "Apex Tex Mills",
  "Classic Weavers & Co",
  "Sunrise Fabrics",
  "Vardhman Textiles Ltd",
  "Royal Cotton Traders",
  "Pioneer Loom House",
  "Galaxy Fashion Weaves",
  "Elite Clothing Distributors",
  "Heritage Sarees & Textiles",
  "Swastik Apparel Traders"
];
