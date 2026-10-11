import type {
  Database,
  DeliveryCostKind,
  TransferKind,
} from "~/types/database.types";
import { normalizeDecimalInput, parseDecimal } from "~/utils/formatNumber";
import {
  transferKindLabel,
  transferKindOptions,
} from "~/features/cash-transfers/composables/useCashTransfers";
import {
  deliveryCostKindLabel,
  deliveryCostRest,
  formatNolonAuto,
  isNolonMatchingAuto,
  nolonFromKg,
  NOLON_RATE_PER_TON,
  paymentsForDelivery,
  sumDeliveryCostPaid,
  type DeliveryCostPaymentLite,
} from "~/utils/deliveryCosts";

export type SupplierDue =
  Database["public"]["Functions"]["supplier_due"]["Returns"][number];

export type SupplierPurchase =
  Database["public"]["Views"]["purchase_ledger"]["Row"];
export type SupplierTransfer =
  Database["public"]["Tables"]["cash_transfers"]["Row"];
export type DeliveryDestinationKind = "warehouse" | "store";

export type SupplierDelivery =
  Database["public"]["Tables"]["warehouse_deliveries"]["Row"] & {
    warehouses?: { id: string; name: string } | null;
    warehouse_sections?: { id: string; name: string; warehouse_id: string } | null;
    stores?: { id: string; name: string } | null;
    products?: { id: string; name: string } | null;
    stock_statuses?: { id: string; name: string } | null;
  };

type WarehouseSectionLite = {
  id: string;
  name: string;
  warehouse_id: string;
};

type SeasonLite = { id: string; name: string; ardab_factor: number };
type WarehouseLite = { id: string; name: string; account_type_id: string };
type StoreLite = { id: string; name: string };
type ProductLite = { id: string; name: string };
type StatusLite = { id: string; name: string; product_id: string };
type SupplierLite = {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  account_type_id: string;
  account_type_name: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function useSupplierDetail(supplierId: MaybeRefOrGetter<string>) {
  const client = useSupabaseClient<Database>();
  const toast = useToast();
  const { confirm: askConfirm } = useConfirmDialog();
  const { kgToArdab, totalPrice } = useArdab();

  const loading = ref(true);
  const saving = ref(false);
  const supplier = ref<SupplierLite | null>(null);
  const due = ref<SupplierDue | null>(null);
  const dueByProduct = ref<SupplierDue[]>([]);
  const activeSeason = ref<SeasonLite | null>(null);
  const warehouses = ref<WarehouseLite[]>([]);
  const stores = ref<StoreLite[]>([]);
  const sections = ref<WarehouseSectionLite[]>([]);
  const products = ref<ProductLite[]>([]);
  const stockStatuses = ref<StatusLite[]>([]);
  const purchases = ref<SupplierPurchase[]>([]);
  const transfers = ref<SupplierTransfer[]>([]);
  const deliveries = ref<SupplierDelivery[]>([]);
  const costPayments = ref<DeliveryCostPaymentLite[]>([]);

  /** Excel-sheet style: one product at a time on this page */
  const selectedProductId = ref("");

  /** Inline ledger row (Excel-style) instead of create/edit modals */
  const purchaseInlineOpen = ref(false);
  const transferInlineOpen = ref(false);
  const deliveryInlineOpen = ref(false);
  const supplierEditModalOpen = ref(false);
  const paymentModalOpen = ref(false);
  const editingPurchase = ref<SupplierPurchase | null>(null);
  const editingTransfer = ref<SupplierTransfer | null>(null);
  const editingDelivery = ref<SupplierDelivery | null>(null);
  const paymentDelivery = ref<SupplierDelivery | null>(null);
  const paymentKind = ref<DeliveryCostKind>("nolon");

  const purchaseForm = reactive({
    product_id: "" as string,
    purchase_date: todayIsoDate(),
    quantity_kg: "" as string,
    price_per_ardab: "" as string,
    notes: "",
  });

  const transferForm = reactive({
    transfer_date: todayIsoDate(),
    amount: "" as string,
    kind: "transfer" as TransferKind,
    notes: "",
  });

  const deliveryForm = reactive({
    destination_kind: "warehouse" as DeliveryDestinationKind,
    warehouse_id: "" as string,
    section_id: "" as string,
    store_id: "" as string,
    product_id: "" as string,
    delivery_date: todayIsoDate(),
    quantity_kg: "" as string,
    nolon_total: "" as string,
    nolon_paid: "" as string,
    nathriyat_total: "" as string,
    nathriyat_paid: "" as string,
    vehicle_number: "",
    notes: "",
  });

  const deliveryDestinationOptions: {
    label: string
    value: DeliveryDestinationKind
  }[] = [
    { label: "شونة", value: "warehouse" },
    { label: "مخزن", value: "store" },
  ];

  const paymentForm = reactive({
    amount: "" as string,
    payment_date: todayIsoDate(),
    notes: "",
  });

  /** When false, nolon_total follows kg × rate; user edit flips it to true */
  const nolonManualOverride = ref(false);

  const supplierEditForm = reactive({
    name: "",
    notes: "",
    account_type_id: "" as string,
  });

  const suggestedNolon = computed(() =>
    nolonFromKg(parseDecimal(deliveryForm.quantity_kg)),
  );

  const computedPurchaseArdab = computed(() => {
    const factor = activeSeason.value?.ardab_factor ?? 170;
    return kgToArdab(parseDecimal(purchaseForm.quantity_kg), Number(factor));
  });

  const computedPurchaseTotal = computed(() =>
    totalPrice(
      computedPurchaseArdab.value,
      parseDecimal(purchaseForm.price_per_ardab),
    ),
  );

  const computedDeliveryArdab = computed(() => {
    const factor = activeSeason.value?.ardab_factor ?? 170;
    return kgToArdab(parseDecimal(deliveryForm.quantity_kg), Number(factor));
  });

  const warehouseOptions = computed(() => {
    const typeId = supplier.value?.account_type_id;
    const rows = warehouses.value.filter(
      (w) =>
        !typeId
        || w.account_type_id === typeId
        || w.id === deliveryForm.warehouse_id,
    );
    return rows.map((w) => ({ label: w.name, value: w.id }));
  });

  const storeOptions = computed(() =>
    stores.value.map((s) => ({ label: s.name, value: s.id })),
  );

  const syncWarehouseForSupplierType = () => {
    const options = warehouseOptions.value;
    if (!options.length) {
      deliveryForm.warehouse_id = "";
      syncSectionForWarehouse();
      return;
    }
    if (!options.some((o) => o.value === deliveryForm.warehouse_id)) {
      deliveryForm.warehouse_id = options[0]?.value || "";
    }
    syncSectionForWarehouse();
  };

  const syncStoreSelection = () => {
    const options = storeOptions.value;
    if (!options.length) {
      deliveryForm.store_id = "";
      return;
    }
    if (!options.some((o) => o.value === deliveryForm.store_id)) {
      deliveryForm.store_id = options[0]?.value || "";
    }
  };

  const onDeliveryDestinationChange = async () => {
    if (deliveryForm.destination_kind === "warehouse") {
      deliveryForm.store_id = "";
      if (!(await ensureWarehousesLoaded())) return;
      if (!warehouseOptions.value.length) {
        toast.add({
          title: "لا توجد شون بنفس نوع المورد",
          color: "warning",
        });
        return;
      }
      syncWarehouseForSupplierType();
      return;
    }
    deliveryForm.warehouse_id = "";
    deliveryForm.section_id = "";
    if (!(await ensureStoresLoaded())) return;
    if (!storeOptions.value.length) {
      toast.add({
        title: "لا توجد مخازن",
        description: "أضف مخزناً أولاً",
        color: "warning",
      });
      return;
    }
    syncStoreSelection();
  };

  const productOptions = computed(() =>
    products.value.map((p) => ({ label: p.name, value: p.id })),
  );

  const reloadStatuses = async () => {
    const { data, error } = await client
      .from("stock_statuses")
      .select("id, name, product_id")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    stockStatuses.value = data ?? [];
  };

  /** Delivery no longer asks for status — use product default (بدون غربلة). */
  const resolveStatusIdForProduct = async (productId: string) => {
    if (!productId) return null;
    let forProduct = stockStatuses.value.filter((s) => s.product_id === productId);
    if (!forProduct.length) {
      await client.from("stock_statuses").insert([
        { product_id: productId, name: "بدون غربلة", notes: "الحالة الافتراضية" },
        { product_id: productId, name: "مغربل", notes: null },
      ]);
      await reloadStatuses();
      forProduct = stockStatuses.value.filter((s) => s.product_id === productId);
    }
    const preferred = forProduct.find(
      (s) => s.name.trim() === "بدون غربلة",
    );
    return preferred?.id || forProduct[0]?.id || null;
  };

  const deliveryProductOptions = computed(() => {
    const purchasedIds = new Set(purchases.value.map((p) => p.product_id));
    return products.value
      .filter((p) => purchasedIds.has(p.id))
      .map((p) => ({ label: p.name, value: p.id }));
  });

  const purchasedKgOf = (productId: string) =>
    purchases.value
      .filter((p) => p.product_id === productId)
      .reduce((sum, p) => sum + Number(p.quantity_kg), 0);

  const deliveredKgOf = (productId: string, excludeDeliveryId?: string | null) =>
    deliveries.value
      .filter(
        (d) =>
          d.product_id === productId
          && (!excludeDeliveryId || d.id !== excludeDeliveryId),
      )
      .reduce((sum, d) => sum + Number(d.quantity_kg), 0);

  /** Remaining purchasable kg for a product (exclude editing delivery when set). */
  const remainingKgOfProduct = (
    productId: string,
    excludeDeliveryId?: string | null,
  ) =>
    Number(
      (purchasedKgOf(productId) - deliveredKgOf(productId, excludeDeliveryId)).toFixed(
        4,
      ),
    );

  const productNameById = computed(() => {
    const map = new Map<string, string>();
    for (const p of products.value) map.set(p.id, p.name);
    return map;
  });

  const productNameOf = (productId: string | null | undefined) =>
    (productId && productNameById.value.get(productId)) || "—";

  const filteredPurchases = computed(() =>
    selectedProductId.value
      ? purchases.value.filter((p) => p.product_id === selectedProductId.value)
      : [],
  );

  const filteredDeliveries = computed(() =>
    selectedProductId.value
      ? deliveries.value.filter((d) => d.product_id === selectedProductId.value)
      : [],
  );

  const filteredTransfers = computed(() =>
    selectedProductId.value
      ? transfers.value.filter((t) => t.product_id === selectedProductId.value)
      : [],
  );

  const selectedProductName = computed(() =>
    productNameOf(selectedProductId.value),
  );

  const selectedProductRemainingKg = computed(() =>
    selectedProductId.value
      ? remainingKgOfProduct(selectedProductId.value)
      : 0,
  );

  const syncSelectedProduct = () => {
    const options = productOptions.value;
    if (!options.length) {
      selectedProductId.value = "";
      return;
    }
    if (
      selectedProductId.value
      && options.some((o) => o.value === selectedProductId.value)
    ) {
      return;
    }
    const purchasedIds = new Set(purchases.value.map((p) => p.product_id));
    const firstPurchased = options.find((o) => purchasedIds.has(o.value));
    selectedProductId.value = firstPurchased?.value || options[0]?.value || "";
  };

  const onSelectedProductChange = () => {
    if (!selectedProductId.value) return;
    if (purchaseInlineOpen.value && !editingPurchase.value) {
      purchaseForm.product_id = selectedProductId.value;
    }
    if (deliveryInlineOpen.value && !editingDelivery.value) {
      deliveryForm.product_id = selectedProductId.value;
    }
  };

  const ardabSummary = computed(() => {
    const rows = dueByProduct.value;
    const total = rows.reduce((sum, r) => sum + Number(r.ardab_total || 0), 0);
    const delivered = rows.reduce(
      (sum, r) => sum + Number(r.ardab_delivered || 0),
      0,
    );
    const remaining = rows.reduce(
      (sum, r) => sum + Number(r.ardab_remaining || 0),
      0,
    );
    return {
      total: Number(total.toFixed(4)),
      delivered: Number(delivered.toFixed(4)),
      remaining: Number(remaining.toFixed(4)),
      byProduct: rows.map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        ardab_total: Number(r.ardab_total || 0),
        ardab_delivered: Number(r.ardab_delivered || 0),
        ardab_remaining: Number(r.ardab_remaining || 0),
      })),
    };
  });

  const sectionOptions = computed(() =>
    sections.value
      .filter((s) => s.warehouse_id === deliveryForm.warehouse_id)
      .map((s) => ({ label: s.name, value: s.id })),
  );

  const syncSectionForWarehouse = () => {
    const options = sectionOptions.value;
    if (!options.length) {
      deliveryForm.section_id = "";
      return;
    }
    if (!options.some((o) => o.value === deliveryForm.section_id)) {
      deliveryForm.section_id = options[0]?.value || "";
    }
  };

  const onDeliveryWarehouseChange = () => {
    syncSectionForWarehouse();
  };

  const purchasePriceStats = computed(() => {
    const rows = filteredPurchases.value;
    const productDeliveries = filteredDeliveries.value;
    const nolonTotal = productDeliveries.reduce(
      (sum, d) => sum + Number(d.nolon_total || 0),
      0,
    );
    const nathriyatTotal = productDeliveries.reduce(
      (sum, d) => sum + Number(d.nathriyat_total || 0),
      0,
    );
    // Commission is supplier-wide money — not included in per-product costed avg
    if (!rows.length) {
      const costedTotal = nolonTotal + nathriyatTotal;
      return { avgPrice: 0, lastPrice: 0, costedTotal };
    }
    const totalArdab = rows.reduce((sum, p) => sum + Number(p.ardab), 0);
    const purchasesTotal = rows.reduce(
      (sum, p) => sum + Number(p.total_price),
      0,
    );
    const costedTotal = purchasesTotal + nolonTotal + nathriyatTotal;
    const avgPrice =
      totalArdab > 0 ? Number((costedTotal / totalArdab).toFixed(4)) : 0;
    const lastPrice = Number(rows[rows.length - 1]?.price_per_ardab ?? 0);
    return { avgPrice, lastPrice, costedTotal };
  });

  const transferTotals = computed(() => {
    const rows = filteredTransfers.value;
    const commission = rows
      .filter((t) => t.kind === "commission")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const againstPurchase = rows
      .filter((t) => t.kind !== "commission")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      amount: againstPurchase + commission,
      againstPurchase,
      commission,
      count: rows.length,
    };
  });

  const purchaseTotals = computed(() => {
    const rows = filteredPurchases.value;
    const kg = rows.reduce((sum, p) => sum + Number(p.quantity_kg), 0);
    const ardab = rows.reduce((sum, p) => sum + Number(p.ardab), 0);
    const price = rows.reduce((sum, p) => sum + Number(p.total_price), 0);
    const lastAvg = Number(rows[rows.length - 1]?.running_avg_price ?? 0);
    return {
      kg,
      ardab,
      price,
      avgPrice:
        lastAvg > 0
          ? lastAvg
          : ardab > 0
            ? Number((price / ardab).toFixed(4))
            : 0,
    };
  });

  /** Display avg from purchase_ledger view (DB source of truth) */
  const purchaseRunningAvgOf = (purchaseId: string) => {
    const row = purchases.value.find((p) => p.id === purchaseId);
    return Number(row?.running_avg_price ?? 0);
  };

  /** Live preview only while creating/editing inline (not persisted) — same product only */
  const computedPurchaseRunningAvg = computed(() => {
    const editingId = editingPurchase.value?.id ?? null;
    const pid =
      purchaseForm.product_id || selectedProductId.value || editingPurchase.value?.product_id;
    let sumArdab = 0;
    let sumMoney = 0;
    for (const p of purchases.value) {
      if (pid && p.product_id !== pid) continue;
      if (editingId && p.id === editingId) continue;
      sumArdab += Number(p.ardab);
      sumMoney += Number(p.total_price);
    }
    sumArdab += computedPurchaseArdab.value;
    sumMoney += computedPurchaseTotal.value;
    return sumArdab > 0 ? Number((sumMoney / sumArdab).toFixed(4)) : 0;
  });

  const deliveryTotals = computed(() => {
    const rows = filteredDeliveries.value;
    const deliveryIds = new Set(rows.map((d) => d.id));
    const kg = rows.reduce((sum, d) => sum + Number(d.quantity_kg), 0);
    const ardab = rows.reduce((sum, d) => sum + Number(d.ardab), 0);
    const nolon = rows.reduce((sum, d) => sum + Number(d.nolon_total || 0), 0);
    const nathriyat = rows.reduce(
      (sum, d) => sum + Number(d.nathriyat_total || 0),
      0,
    );
    const nolonPaid = costPayments.value
      .filter(
        (p) =>
          p.kind === "nolon"
          && !p.is_cancelled
          && deliveryIds.has(p.delivery_id),
      )
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const nathriyatPaid = costPayments.value
      .filter(
        (p) =>
          p.kind === "nathriyat"
          && !p.is_cancelled
          && deliveryIds.has(p.delivery_id),
      )
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      kg,
      ardab,
      nolon,
      nolonPaid,
      nathriyat,
      nathriyatPaid,
      costTotal: nolon + nathriyat,
      costPaid: nolonPaid + nathriyatPaid,
      costNeeded: deliveryCostRest(nolon + nathriyat, nolonPaid + nathriyatPaid),
    };
  });

  /**
   * Running purchase-kg need around each delivery (per product of that row):
   * before = remaining for that product before this transfer,
   * after = remaining after it.
   * While editing a row, uses live form kg for that row.
   */
  const deliveryKgRunningById = computed(() => {
    const map = new Map<string, { before: number; after: number }>();
    const editingId = editingDelivery.value?.id ?? null;
    const editingPid = editingId ? deliveryForm.product_id : null;

    // Remaining per product before walking deliveries in order
    const remainingByProduct = new Map<string, number>();
    for (const p of purchases.value) {
      const cur = remainingByProduct.get(p.product_id) || 0;
      remainingByProduct.set(p.product_id, cur + Number(p.quantity_kg));
    }

    for (const d of deliveries.value) {
      const pid =
        editingId && d.id === editingId
          ? deliveryForm.product_id || d.product_id
          : d.product_id;
      const transfer =
        editingId && d.id === editingId
          ? parseDecimal(deliveryForm.quantity_kg)
          : Number(d.quantity_kg);
      const before = Number((remainingByProduct.get(pid) ?? 0).toFixed(4));
      const after = Number((before - transfer).toFixed(4));
      map.set(d.id, { before, after });
      remainingByProduct.set(pid, after);
    }

    // If editing changed product away from original, ensure map still updated
    if (editingId && editingPid) {
      /* already handled in loop when id matches */
    }
    return map;
  });

  const deliveryKgRunningOf = (deliveryId: string) =>
    deliveryKgRunningById.value.get(deliveryId) ?? { before: 0, after: 0 };

  /** Preview for new delivery row — remaining for selected product only. */
  const deliveryCreateKgRunning = computed(() => {
    const pid = selectedProductId.value || deliveryForm.product_id;
    const before = pid ? remainingKgOfProduct(pid) : 0;
    const after = Number(
      (before - parseDecimal(deliveryForm.quantity_kg)).toFixed(4),
    );
    return { before, after };
  });

  /** Max kg allowed for current create/edit form (per selected product). */
  const deliveryMaxKgAllowed = computed(() => {
    const pid = selectedProductId.value || deliveryForm.product_id;
    if (!pid) return 0;
    if (isDeliveryCreating.value) return remainingKgOfProduct(pid);
    const editingId = editingDelivery.value?.id;
    return remainingKgOfProduct(pid, editingId);
  });

  /** Final remaining kg after all deliveries for selected product. */
  const deliveryKgRemainingFinal = computed(() => {
    if (isDeliveryCreating.value) return deliveryCreateKgRunning.value.after;
    const pid = selectedProductId.value || deliveryForm.product_id;
    if (!pid) {
      return Number(
        (purchaseTotals.value.kg - deliveryTotals.value.kg).toFixed(4),
      );
    }
    if (editingDelivery.value) {
      return remainingKgOfProduct(pid, editingDelivery.value.id)
        - parseDecimal(deliveryForm.quantity_kg);
    }
    return remainingKgOfProduct(pid);
  });

  const deliveryCostStats = computed(() => {
    const t = deliveryTotals.value;
    return {
      nolonTotal: t.nolon,
      nolonPaid: t.nolonPaid,
      nolonRest: deliveryCostRest(t.nolon, t.nolonPaid),
      nathriyatTotal: t.nathriyat,
      nathriyatPaid: t.nathriyatPaid,
      nathriyatRest: deliveryCostRest(t.nathriyat, t.nathriyatPaid),
    };
  });

  /** Due row for the selected product (money is per supplier × product) */
  const selectedProductDue = computed(() => {
    const pid = selectedProductId.value;
    if (!pid) return null;
    return dueByProduct.value.find((r) => r.product_id === pid) ?? null;
  });

  /** Compact header stats — all scoped to selected product */
  const supplierDetailStats = computed(() => {
    const paidTotal = transferTotals.value.amount;
    const supplierDue = Number(selectedProductDue.value?.balance ?? 0);
    const deliveryCostsDue =
      deliveryCostStats.value.nolonRest + deliveryCostStats.value.nathriyatRest;
    const grandDue = Number((supplierDue + deliveryCostsDue).toFixed(2));
    return {
      kg: purchaseTotals.value.kg,
      ardab: purchaseTotals.value.ardab,
      avgPrice: purchasePriceStats.value.avgPrice,
      lastPrice: purchasePriceStats.value.lastPrice,
      costTotal: purchasePriceStats.value.costedTotal,
      paidTotal,
      supplierDue,
      deliveryCostsDue: Number(deliveryCostsDue.toFixed(2)),
      grandDue,
    };
  });

  const nolonPaidOf = (deliveryId: string) =>
    sumDeliveryCostPaid(costPayments.value, deliveryId, "nolon");

  const nathriyatPaidOf = (deliveryId: string) =>
    sumDeliveryCostPaid(costPayments.value, deliveryId, "nathriyat");

  const nolonRestOf = (row: SupplierDelivery) =>
    deliveryCostRest(row.nolon_total, nolonPaidOf(row.id));

  const nathriyatRestOf = (row: SupplierDelivery) =>
    deliveryCostRest(row.nathriyat_total, nathriyatPaidOf(row.id));

  /** Combined nolon + nathriyat for delivery ledger columns */
  const deliveryCostBundleOf = (row: SupplierDelivery) => {
    const total =
      Number(row.nolon_total || 0) + Number(row.nathriyat_total || 0);
    const paid = nolonPaidOf(row.id) + nathriyatPaidOf(row.id);
    const needed = deliveryCostRest(total, paid);
    return { total, paid, needed };
  };

  const deliveryFormCostBundle = computed(() => {
    const total =
      parseDecimal(deliveryForm.nolon_total) +
      parseDecimal(deliveryForm.nathriyat_total);
    const paid =
      parseDecimal(deliveryForm.nolon_paid) +
      parseDecimal(deliveryForm.nathriyat_paid);
    const needed = deliveryCostRest(total, paid);
    return { total, paid, needed };
  });

  const paymentsOf = (deliveryId: string) =>
    paymentsForDelivery(costPayments.value, deliveryId);

  /** Allow new transfer when purchase balance remains, or always allow commission */
  const canAddTransfer = computed(() => true);

  /** Show «تسجيل تسليم» only when selected product still has remaining kg */
  const canAddDelivery = computed(() =>
    !!selectedProductId.value
    && remainingKgOfProduct(selectedProductId.value) > 0.001,
  );

  const paymentRemaining = computed(() => {
    if (!paymentDelivery.value) return 0;
    return paymentKind.value === "nolon"
      ? nolonRestOf(paymentDelivery.value)
      : nathriyatRestOf(paymentDelivery.value);
  });

  const ensureCanCreate = () => {
    if (!activeSeason.value) {
      toast.add({
        title: "لا يوجد موسم نشط",
        description: "فعّل موسماً من شاشة المواسم أولاً",
        color: "warning",
      });
      return false;
    }
    if (!supplier.value) {
      toast.add({ title: "المورد غير موجود", color: "warning" });
      return false;
    }
    return true;
  };

  const ensureWarehousesLoaded = async () => {
    const needWarehouses = !warehouses.value.length;
    const needSections = !sections.value.length;
    if (!needWarehouses && !needSections) return true;
    const [whRes, secRes] = await Promise.all([
      needWarehouses
        ? client
            .from("warehouses")
            .select("id, name, account_type_id")
            .eq("is_active", true)
            .order("name")
        : Promise.resolve({ data: warehouses.value, error: null }),
      needSections
        ? client
            .from("warehouse_sections")
            .select("id, name, warehouse_id")
            .eq("is_active", true)
            .order("name")
        : Promise.resolve({ data: sections.value, error: null }),
    ]);
    if (whRes.error) {
      toast.add({
        title: "تعذر تحميل الشون",
        description: whRes.error.message,
        color: "error",
      });
      return false;
    }
    if (secRes.error) {
      toast.add({
        title: "تعذر تحميل الأرباع",
        description: secRes.error.message,
        color: "error",
      });
      return false;
    }
    if (needWarehouses) warehouses.value = whRes.data ?? [];
    if (needSections) sections.value = secRes.data ?? [];
    return true;
  };

  const ensureStoresLoaded = async () => {
    if (stores.value.length) return true;
    const { data, error } = await client
      .from("stores")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (error) {
      toast.add({
        title: "تعذر تحميل المخازن",
        description: error.message,
        color: "error",
      });
      return false;
    }
    stores.value = data ?? [];
    return true;
  };

  const cancelPurchaseInline = () => {
    purchaseInlineOpen.value = false;
    editingPurchase.value = null;
  };

  const cancelTransferInline = () => {
    transferInlineOpen.value = false;
    editingTransfer.value = null;
  };

  const cancelDeliveryInline = () => {
    deliveryInlineOpen.value = false;
    editingDelivery.value = null;
    nolonManualOverride.value = false;
  };

  const openPurchaseCreate = () => {
    if (!ensureCanCreate()) return;
    if (!products.value.length) {
      toast.add({
        title: "لا يوجد أصناف",
        description: "أضف صنفاً قبل تسجيل شراء",
        color: "warning",
      });
      return;
    }
    if (!selectedProductId.value) {
      syncSelectedProduct();
    }
    if (!selectedProductId.value) {
      toast.add({
        title: "اختر الصنف أولاً",
        color: "warning",
      });
      return;
    }
    editingPurchase.value = null;
    purchaseForm.product_id = selectedProductId.value;
    purchaseForm.purchase_date = todayIsoDate();
    purchaseForm.quantity_kg = "";
    purchaseForm.price_per_ardab = "";
    purchaseForm.notes = "";
    purchaseInlineOpen.value = true;
  };

  const openPurchaseEdit = (row: SupplierPurchase) => {
    editingPurchase.value = row;
    purchaseForm.product_id = row.product_id;
    purchaseForm.purchase_date = row.purchase_date;
    purchaseForm.quantity_kg = String(row.quantity_kg);
    purchaseForm.price_per_ardab = String(row.price_per_ardab);
    purchaseForm.notes = row.notes || "";
    purchaseInlineOpen.value = true;
  };

  const isPurchaseRowEditing = (row: SupplierPurchase) =>
    purchaseInlineOpen.value && editingPurchase.value?.id === row.id;

  const openTransferCreate = () => {
    if (!ensureCanCreate()) return;
    if (!selectedProductId.value) {
      toast.add({ title: "اختر الصنف أولاً", color: "warning" });
      return;
    }
    if (!canAddTransfer.value) {
      toast.add({ title: "لا يوجد مستحق للدفع", color: "warning" });
      return;
    }
    editingTransfer.value = null;
    transferForm.transfer_date = todayIsoDate();
    transferForm.amount = "";
    transferForm.kind = "transfer";
    transferForm.notes = "";
    transferInlineOpen.value = true;
  };

  const openTransferEdit = (row: SupplierTransfer) => {
    editingTransfer.value = row;
    transferForm.transfer_date = row.transfer_date;
    transferForm.amount = String(row.amount);
    transferForm.kind = row.kind;
    transferForm.notes = row.notes || "";
    transferInlineOpen.value = true;
  };

  const isTransferRowEditing = (row: SupplierTransfer) =>
    transferInlineOpen.value && editingTransfer.value?.id === row.id;

  const openDeliveryCreate = async () => {
    if (!ensureCanCreate()) return;
    if (!selectedProductId.value) {
      toast.add({ title: "اختر الصنف أولاً", color: "warning" });
      return;
    }
    if (!canAddDelivery.value) {
      toast.add({
        title: "لا يوجد باقي كجم لهذا الصنف",
        description: "سجّل شراء لهذا الصنف أولاً أو اختر صنفاً آخر",
        color: "warning",
      });
      return;
    }
    editingDelivery.value = null;
    deliveryForm.destination_kind = "warehouse";
    deliveryForm.store_id = "";
    if (!(await ensureWarehousesLoaded())) return;
    if (!warehouseOptions.value.length) {
      // Fall back to store if no matching warehouse
      if (!(await ensureStoresLoaded()) || !storeOptions.value.length) {
        toast.add({
          title: "لا توجد شونة أو مخزن متاح",
          description: "أضف شونة بنفس نوع الحساب أو مخزناً أولاً",
          color: "warning",
        });
        return;
      }
      deliveryForm.destination_kind = "store";
      syncStoreSelection();
    } else {
      syncWarehouseForSupplierType();
    }
    deliveryForm.product_id = selectedProductId.value;
    deliveryForm.delivery_date = todayIsoDate();
    deliveryForm.quantity_kg = "";
    deliveryForm.nolon_total = "";
    deliveryForm.nolon_paid = "";
    deliveryForm.nathriyat_total = "";
    deliveryForm.nathriyat_paid = "";
    deliveryForm.vehicle_number = "";
    deliveryForm.notes = "";
    nolonManualOverride.value = false;
    deliveryInlineOpen.value = true;
  };

  const openDeliveryEdit = async (row: SupplierDelivery) => {
    const kind: DeliveryDestinationKind
      = row.destination_kind === "store" || row.store_id
        ? "store"
        : "warehouse";
    if (kind === "warehouse") {
      if (!(await ensureWarehousesLoaded())) return;
    } else if (!(await ensureStoresLoaded())) {
      return;
    }
    editingDelivery.value = row;
    deliveryForm.destination_kind = kind;
    deliveryForm.warehouse_id = row.warehouse_id || "";
    deliveryForm.section_id = row.section_id || "";
    deliveryForm.store_id = row.store_id || "";
    if (kind === "warehouse") syncSectionForWarehouse();
    else syncStoreSelection();
    deliveryForm.product_id = row.product_id;
    deliveryForm.delivery_date = row.delivery_date;
    deliveryForm.quantity_kg = String(row.quantity_kg);
    deliveryForm.nolon_total = String(row.nolon_total ?? 0);
    deliveryForm.nolon_paid = String(nolonPaidOf(row.id));
    deliveryForm.nathriyat_total = String(row.nathriyat_total ?? 0);
    deliveryForm.nathriyat_paid = String(nathriyatPaidOf(row.id));
    deliveryForm.vehicle_number = row.vehicle_number || "";
    deliveryForm.notes = row.notes || "";
    nolonManualOverride.value = !isNolonMatchingAuto(
      Number(row.quantity_kg),
      Number(row.nolon_total ?? 0),
    );
    deliveryInlineOpen.value = true;
  };

  const isDeliveryRowEditing = (row: SupplierDelivery) =>
    deliveryInlineOpen.value && editingDelivery.value?.id === row.id;

  const isPurchaseCreating = computed(
    () => purchaseInlineOpen.value && !editingPurchase.value,
  );
  const isTransferCreating = computed(
    () => transferInlineOpen.value && !editingTransfer.value,
  );
  const isDeliveryCreating = computed(
    () => deliveryInlineOpen.value && !editingDelivery.value,
  );

  const openDeliveryPay = (row: SupplierDelivery, kind: DeliveryCostKind) => {
    const rest = kind === "nolon" ? nolonRestOf(row) : nathriyatRestOf(row);
    if (!(rest > 0)) {
      toast.add({ title: "لا يوجد باقي للدفع", color: "warning" });
      return;
    }
    paymentDelivery.value = row;
    paymentKind.value = kind;
    paymentForm.amount = String(rest);
    paymentForm.payment_date = todayIsoDate();
    paymentForm.notes = "";
    paymentModalOpen.value = true;
  };

  const saveDeliveryPayment = async () => {
    if (!paymentDelivery.value) return;
    const amount = Math.max(0, parseDecimal(paymentForm.amount));
    const remaining = paymentRemaining.value;
    if (!(amount > 0)) {
      toast.add({ title: "المبلغ يجب أن يكون أكبر من صفر", color: "warning" });
      return;
    }
    if (amount > remaining + 0.001) {
      toast.add({ title: "المبلغ أكبر من الباقي", color: "warning" });
      return;
    }
    if (!paymentForm.payment_date) {
      toast.add({ title: "التاريخ مطلوب", color: "warning" });
      return;
    }

    saving.value = true;
    try {
      const { error } = await client.from("delivery_cost_payments").insert({
        delivery_id: paymentDelivery.value.id,
        kind: paymentKind.value,
        amount,
        payment_date: paymentForm.payment_date,
        notes: paymentForm.notes.trim() || null,
      });
      if (error) throw error;
      toast.add({
        title: `تم تسجيل دفع ${deliveryCostKindLabel(paymentKind.value)}`,
        color: "success",
      });
      paymentModalOpen.value = false;
      await load();
    } catch (e: any) {
      toast.add({
        title: "فشل تسجيل الدفع",
        description: e.message,
        color: "error",
      });
    } finally {
      saving.value = false;
    }
  };

  const softDeleteDeliveryPayment = async (
    payment: DeliveryCostPaymentLite,
  ) => {
    const ok = await askConfirm(
      `حذف دفعة ${deliveryCostKindLabel(payment.kind)} نهائياً؟`,
    );
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("delivery_cost_payments")
        .delete()
        .eq("id", payment.id);
      if (error) throw error;
      toast.add({ title: "تم حذف الدفعة", color: "success" });
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحذف", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const savePurchase = async () => {
    if (!ensureCanCreate() || !supplier.value || !activeSeason.value) return;
    const productId =
      editingPurchase.value?.product_id
      || selectedProductId.value
      || purchaseForm.product_id;
    purchaseForm.product_id = productId;
    const quantityKg = parseDecimal(purchaseForm.quantity_kg);
    const pricePerArdab = parseDecimal(purchaseForm.price_per_ardab);
    if (!productId) {
      toast.add({ title: "اختر الصنف", color: "warning" });
      return;
    }
    if (!purchaseForm.purchase_date) {
      toast.add({ title: "التاريخ مطلوب", color: "warning" });
      return;
    }
    if (!(quantityKg > 0)) {
      toast.add({ title: "الكمية يجب أن تكون أكبر من صفر", color: "warning" });
      return;
    }
    if (!purchaseForm.price_per_ardab.trim() || !(pricePerArdab > 0)) {
      toast.add({ title: "سعر الأردب مطلوب", color: "warning" });
      return;
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: supplier.value.id,
      product_id: purchaseForm.product_id,
      purchase_date: purchaseForm.purchase_date,
      quantity_kg: quantityKg,
      ardab: computedPurchaseArdab.value,
      price_per_ardab: pricePerArdab,
      total_price: computedPurchaseTotal.value,
      notes: purchaseForm.notes.trim() || null,
    };

    saving.value = true;
    try {
      if (editingPurchase.value) {
        const { error } = await client
          .from("purchases")
          .update(payload)
          .eq("id", editingPurchase.value.id);
        if (error) throw error;
        toast.add({ title: "تم تحديث الشراء", color: "success" });
      } else {
        const { error } = await client.from("purchases").insert(payload);
        if (error) throw error;
        toast.add({ title: "تم تسجيل الشراء", color: "success" });
      }
      purchaseInlineOpen.value = false;
      editingPurchase.value = null;
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحفظ", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const saveTransfer = async () => {
    if (!ensureCanCreate() || !supplier.value || !activeSeason.value) return;
    const productId =
      editingTransfer.value?.product_id || selectedProductId.value;
    if (!productId) {
      toast.add({ title: "اختر الصنف أولاً", color: "warning" });
      return;
    }
    const amount = parseDecimal(transferForm.amount);
    if (!transferForm.transfer_date) {
      toast.add({ title: "التاريخ مطلوب", color: "warning" });
      return;
    }
    if (!(amount > 0)) {
      toast.add({ title: "المبلغ يجب أن يكون أكبر من صفر", color: "warning" });
      return;
    }
    if (transferForm.kind === "settlement" && !transferForm.notes.trim()) {
      toast.add({ title: "التسوية تتطلب ملاحظة", color: "warning" });
      return;
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: supplier.value.id,
      product_id: productId,
      transfer_date: transferForm.transfer_date,
      amount,
      kind: transferForm.kind,
      notes: transferForm.notes.trim() || null,
    };

    saving.value = true;
    try {
      if (editingTransfer.value) {
        const { error } = await client
          .from("cash_transfers")
          .update(payload)
          .eq("id", editingTransfer.value.id);
        if (error) throw error;
        toast.add({ title: "تم تحديث التحويل", color: "success" });
      } else {
        const { error } = await client.from("cash_transfers").insert(payload);
        if (error) throw error;
        toast.add({ title: "تم تسجيل التحويل", color: "success" });
      }
      transferInlineOpen.value = false;
      editingTransfer.value = null;
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحفظ", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const saveDelivery = async () => {
    if (!ensureCanCreate() || !supplier.value || !activeSeason.value) return;
    const productId =
      editingDelivery.value?.product_id
      || selectedProductId.value
      || deliveryForm.product_id;
    deliveryForm.product_id = productId;
    const quantityKg = parseDecimal(deliveryForm.quantity_kg);
    const toStore = deliveryForm.destination_kind === "store";

    if (!productId) {
      toast.add({ title: "اختر الصنف", color: "warning" });
      return;
    }

    if (toStore) {
      if (!deliveryForm.store_id) {
        toast.add({ title: "اختر المخزن", color: "warning" });
        return;
      }
    } else {
      if (!deliveryForm.warehouse_id) {
        toast.add({ title: "اختر الشونة", color: "warning" });
        return;
      }
      const warehouse = warehouses.value.find(
        (w) => w.id === deliveryForm.warehouse_id,
      );
      if (
        warehouse
        && supplier.value.account_type_id
        && warehouse.account_type_id !== supplier.value.account_type_id
      ) {
        toast.add({
          title: "نوع المورد يجب أن يطابق نوع الشونة",
          color: "warning",
        });
        return;
      }
      if (!deliveryForm.section_id) {
        toast.add({ title: "اختر الربع", color: "warning" });
        return;
      }
      const sectionOk = sections.value.some(
        (s) =>
          s.id === deliveryForm.section_id
          && s.warehouse_id === deliveryForm.warehouse_id,
      );
      if (!sectionOk) {
        toast.add({
          title: "الربع لا يتبع الشونة المحددة",
          color: "warning",
        });
        return;
      }
    }

    if (!deliveryForm.delivery_date) {
      toast.add({ title: "التاريخ مطلوب", color: "warning" });
      return;
    }
    if (!(quantityKg > 0)) {
      toast.add({ title: "الكمية يجب أن تكون أكبر من صفر", color: "warning" });
      return;
    }

    const maxKg = deliveryMaxKgAllowed.value;
    if (quantityKg > maxKg + 0.001) {
      toast.add({
        title: "الكمية أكبر من المطلوب استلامه لهذا الصنف",
        description: `المتبقي المتاح: ${maxKg.toFixed(2)} كجم`,
        color: "warning",
      });
      return;
    }

    const nolonTotal = Math.max(0, parseDecimal(deliveryForm.nolon_total));
    const nathriyatTotal = Math.max(
      0,
      parseDecimal(deliveryForm.nathriyat_total),
    );
    const nolonPaid = Math.max(0, parseDecimal(deliveryForm.nolon_paid));
    const nathriyatPaid = Math.max(
      0,
      parseDecimal(deliveryForm.nathriyat_paid),
    );

    if (nolonPaid > nolonTotal + 0.001) {
      toast.add({
        title: "مدفوع النولون أكبر من الإجمالي",
        color: "warning",
      });
      return;
    }
    if (nathriyatPaid > nathriyatTotal + 0.001) {
      toast.add({
        title: "مدفوع النثريات أكبر من الإجمالي",
        color: "warning",
      });
      return;
    }

    const statusId =
      editingDelivery.value
      && editingDelivery.value.product_id === deliveryForm.product_id
        ? editingDelivery.value.status_id
        : await resolveStatusIdForProduct(deliveryForm.product_id);
    if (!statusId) {
      toast.add({
        title: "تعذر تحديد حالة الصنف",
        description: "أضف حالات من صفحة الصنف أولاً",
        color: "warning",
      });
      return;
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: supplier.value.id,
      destination_kind: toStore ? "store" as const : "warehouse" as const,
      warehouse_id: toStore ? null : deliveryForm.warehouse_id,
      section_id: toStore ? null : deliveryForm.section_id,
      store_id: toStore ? deliveryForm.store_id : null,
      product_id: deliveryForm.product_id,
      status_id: statusId,
      delivery_date: deliveryForm.delivery_date,
      quantity_kg: quantityKg,
      ardab: computedDeliveryArdab.value,
      nolon_total: nolonTotal,
      nathriyat_total: nathriyatTotal,
      vehicle_number: deliveryForm.vehicle_number.trim() || null,
      notes: deliveryForm.notes.trim() || null,
    };

    /** Replace paid total for a kind: cancel old rows, insert one if amount > 0 */
    const syncPaidTotal = async (
      deliveryId: string,
      kind: DeliveryCostKind,
      targetPaid: number,
    ) => {
      const current =
        kind === "nolon" ? nolonPaidOf(deliveryId) : nathriyatPaidOf(deliveryId);
      if (Math.abs(current - targetPaid) < 0.001) return;

      const { error: cancelError } = await client
        .from("delivery_cost_payments")
        .delete()
        .eq("delivery_id", deliveryId)
        .eq("kind", kind)
        .eq("is_cancelled", false);
      if (cancelError) throw cancelError;

      if (targetPaid > 0) {
        const { error: insertError } = await client
          .from("delivery_cost_payments")
          .insert({
            delivery_id: deliveryId,
            kind,
            amount: targetPaid,
            payment_date: deliveryForm.delivery_date,
            notes: "تعديل من صف التسليم",
          });
        if (insertError) throw insertError;
      }
    };

    saving.value = true;
    try {
      if (editingDelivery.value) {
        const deliveryId = editingDelivery.value.id;
        const { error } = await client
          .from("warehouse_deliveries")
          .update(payload)
          .eq("id", deliveryId);
        if (error) throw error;
        await syncPaidTotal(deliveryId, "nolon", nolonPaid);
        await syncPaidTotal(deliveryId, "nathriyat", nathriyatPaid);
        toast.add({ title: "تم تحديث التسليم", color: "success" });
      } else {
        const { data, error } = await client
          .from("warehouse_deliveries")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;

        const initialPayments = [];
        if (nolonPaid > 0) {
          initialPayments.push({
            delivery_id: data.id,
            kind: "nolon" as const,
            amount: nolonPaid,
            payment_date: deliveryForm.delivery_date,
            notes: null,
          });
        }
        if (nathriyatPaid > 0) {
          initialPayments.push({
            delivery_id: data.id,
            kind: "nathriyat" as const,
            amount: nathriyatPaid,
            payment_date: deliveryForm.delivery_date,
            notes: null,
          });
        }
        if (initialPayments.length) {
          const { error: payError } = await client
            .from("delivery_cost_payments")
            .insert(initialPayments);
          if (payError) throw payError;
        }

        toast.add({ title: "تم تسجيل التسليم", color: "success" });
      }
      deliveryInlineOpen.value = false;
      editingDelivery.value = null;
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحفظ", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const softDeletePurchase = async (row: SupplierPurchase) => {
    const ok = await askConfirm("حذف عملية الشراء نهائياً؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("purchases")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.add({ title: "تم حذف الشراء", color: "success" });
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحذف", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const softDeleteTransfer = async (row: SupplierTransfer) => {
    const ok = await askConfirm("حذف التحويل نهائياً؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("cash_transfers")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.add({ title: "تم الحذف", color: "success" });
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحذف", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const softDeleteDelivery = async (row: SupplierDelivery) => {
    const ok = await askConfirm("حذف التسليم نهائياً؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("warehouse_deliveries")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.add({ title: "تم الحذف", color: "success" });
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحذف", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const openSupplierEdit = () => {
    if (!supplier.value) return;
    supplierEditForm.name = supplier.value.name;
    supplierEditForm.notes = supplier.value.notes || "";
    supplierEditForm.account_type_id = supplier.value.account_type_id;
    supplierEditModalOpen.value = true;
  };

  const saveSupplierEdit = async () => {
    if (!supplier.value) return;
    if (!supplierEditForm.name.trim()) {
      toast.add({ title: "الاسم مطلوب", color: "warning" });
      return;
    }
    if (!supplierEditForm.account_type_id) {
      toast.add({ title: "اختر نوع الحساب", color: "warning" });
      return;
    }
    saving.value = true;
    try {
      const payload = {
        name: supplierEditForm.name.trim(),
        notes: supplierEditForm.notes.trim() || null,
        account_type_id: supplierEditForm.account_type_id,
      };
      const { error } = await client
        .from("suppliers")
        .update(payload)
        .eq("id", supplier.value.id);
      if (error) throw error;
      toast.add({ title: "تم تحديث المورد", color: "success" });
      supplierEditModalOpen.value = false;
      await load();
    } catch (e: any) {
      toast.add({ title: "فشل الحفظ", description: e.message, color: "error" });
    } finally {
      saving.value = false;
    }
  };

  const load = async () => {
    const id = toValue(supplierId);
    if (!id) {
      loading.value = false;
      return;
    }

    loading.value = true;
    try {
      const [supplierRes, seasonRes, warehousesRes, sectionsRes, productsRes, statusesRes] =
        await Promise.all([
          client
            .from("suppliers")
            .select("id, name, notes, is_active, account_type_id, account_types(name)")
            .eq("id", id)
            .maybeSingle(),
          client
            .from("seasons")
            .select("id, name, ardab_factor")
            .eq("is_active", true)
            .maybeSingle(),
          client
            .from("warehouses")
            .select("id, name, account_type_id")
            .eq("is_active", true)
            .order("name"),
          client
            .from("warehouse_sections")
            .select("id, name, warehouse_id")
            .eq("is_active", true)
            .order("name"),
          client
            .from("products")
            .select("id, name")
            .eq("is_active", true)
            .order("name"),
          client
            .from("stock_statuses")
            .select("id, name, product_id")
            .eq("is_active", true)
            .order("name"),
        ]);
      if (supplierRes.error) throw supplierRes.error;
      if (seasonRes.error) throw seasonRes.error;
      if (warehousesRes.error) throw warehousesRes.error;
      if (sectionsRes.error) throw sectionsRes.error;
      if (productsRes.error) throw productsRes.error;
      if (statusesRes.error) throw statusesRes.error;

      const rawSupplier = supplierRes.data as
        | (Omit<SupplierLite, "account_type_name"> & {
            account_types?: { name: string } | null
          })
        | null;
      supplier.value = rawSupplier
        ? {
            id: rawSupplier.id,
            name: rawSupplier.name,
            notes: rawSupplier.notes,
            is_active: rawSupplier.is_active,
            account_type_id: rawSupplier.account_type_id,
            account_type_name: rawSupplier.account_types?.name || "—",
          }
        : null;
      activeSeason.value = seasonRes.data;
      warehouses.value = warehousesRes.data ?? [];
      sections.value = sectionsRes.data ?? [];
      products.value = productsRes.data ?? [];
      stockStatuses.value = statusesRes.data ?? [];

      if (!supplierRes.data || !seasonRes.data) {
        due.value = null;
        dueByProduct.value = [];
        purchases.value = [];
        transfers.value = [];
        deliveries.value = [];
        costPayments.value = [];
        syncSelectedProduct();
        return;
      }

      const seasonId = seasonRes.data.id;
      const [dueRes, purchasesRes, transfersRes, deliveriesRes] =
        await Promise.all([
          client.rpc("supplier_due", {
            p_supplier_id: id,
            p_season_id: seasonId,
          }),
          client
            .from("purchase_ledger")
            .select("*")
            .eq("supplier_id", id)
            .eq("season_id", seasonId)
            .order("purchase_date", { ascending: true })
            .order("created_at", { ascending: true }),
          client
            .from("cash_transfers")
            .select("*")
            .eq("supplier_id", id)
            .eq("season_id", seasonId)
            .eq("is_cancelled", false)
            .order("transfer_date", { ascending: true })
            .order("created_at", { ascending: true }),
          client
            .from("warehouse_deliveries")
            .select(
              "*, warehouses(id, name), warehouse_sections(id, name, warehouse_id), stores(id, name), products(id, name), stock_statuses(id, name)",
            )
            .eq("supplier_id", id)
            .eq("season_id", seasonId)
            .eq("is_cancelled", false)
            .order("delivery_date", { ascending: true })
            .order("created_at", { ascending: true }),
        ]);

      if (dueRes.error) throw dueRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (transfersRes.error) throw transfersRes.error;
      if (deliveriesRes.error) throw deliveriesRes.error;

      dueByProduct.value = dueRes.data ?? [];
      purchases.value = (purchasesRes.data ?? []) as SupplierPurchase[];
      transfers.value = transfersRes.data ?? [];
      deliveries.value = (deliveriesRes.data ?? []) as SupplierDelivery[];

      const deliveryIds = deliveries.value.map((d) => d.id);
      if (deliveryIds.length) {
        const paymentsRes = await client
          .from("delivery_cost_payments")
          .select("*")
          .in("delivery_id", deliveryIds)
          .eq("is_cancelled", false)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (paymentsRes.error) throw paymentsRes.error;
        costPayments.value = (paymentsRes.data ??
          []) as DeliveryCostPaymentLite[];
      } else {
        costPayments.value = [];
      }

      syncSelectedProduct();
      due.value =
        dueByProduct.value.find((r) => r.product_id === selectedProductId.value)
        ?? dueByProduct.value[0]
        ?? null;
    } catch (e: any) {
      toast.add({
        title: "تعذر تحميل كشف المورد",
        description: e.message,
        color: "error",
      });
    } finally {
      loading.value = false;
    }
  };

  watch(
    () => toValue(supplierId),
    () => {
      selectedProductId.value = "";
      void load();
    },
    { immediate: true },
  );

  watch(selectedProductId, () => {
    onSelectedProductChange();
  });

  return {
    loading,
    saving,
    supplier,
    due,
    dueByProduct,
    ardabSummary,
    activeSeason,
    purchases,
    filteredPurchases,
    transfers,
    filteredTransfers,
    deliveries,
    filteredDeliveries,
    selectedProductId,
    selectedProductName,
    selectedProductRemainingKg,
    onSelectedProductChange,
    purchaseInlineOpen,
    transferInlineOpen,
    deliveryInlineOpen,
    isPurchaseCreating,
    isTransferCreating,
    isDeliveryCreating,
    supplierEditModalOpen,
    paymentModalOpen,
    editingPurchase,
    editingTransfer,
    editingDelivery,
    paymentDelivery,
    paymentKind,
    purchaseForm,
    transferForm,
    deliveryForm,
    paymentForm,
    supplierEditForm,
    purchasePriceStats,
    supplierDetailStats,
    purchaseTotals,
    purchaseRunningAvgOf,
    computedPurchaseRunningAvg,
    transferTotals,
    deliveryTotals,
    deliveryKgRunningOf,
    deliveryCreateKgRunning,
    deliveryKgRemainingFinal,
    deliveryMaxKgAllowed,
    deliveryCostStats,
    canAddTransfer,
    canAddDelivery,
    paymentRemaining,
    computedPurchaseArdab,
    computedPurchaseTotal,
    computedDeliveryArdab,
    warehouseOptions,
    storeOptions,
    deliveryDestinationOptions,
    productOptions,
    deliveryProductOptions,
    productNameOf,
    sectionOptions,
    onDeliveryWarehouseChange,
    onDeliveryDestinationChange,
    transferKindOptions,
    transferKindLabel: (kind: TransferKind | string) => transferKindLabel(kind),
    deliveryCostKindLabel,
    nolonRestOf,
    nathriyatRestOf,
    deliveryCostBundleOf,
    deliveryFormCostBundle,
    paymentsOf,
    openDeliveryPay,
    saveDeliveryPayment,
    softDeleteDeliveryPayment,
    openPurchaseCreate,
    openPurchaseEdit,
    cancelPurchaseInline,
    isPurchaseRowEditing,
    openTransferCreate,
    openTransferEdit,
    cancelTransferInline,
    isTransferRowEditing,
    openDeliveryCreate,
    openDeliveryEdit,
    cancelDeliveryInline,
    isDeliveryRowEditing,
    openSupplierEdit,
    saveSupplierEdit,
    savePurchase,
    saveTransfer,
    saveDelivery,
    softDeletePurchase,
    softDeleteTransfer,
    softDeleteDelivery,
    setPurchaseDecimal: (
      field: "quantity_kg" | "price_per_ardab",
      raw: string,
    ) => {
      purchaseForm[field] = normalizeDecimalInput(raw);
    },
    setTransferDecimal: (field: "amount", raw: string) => {
      transferForm[field] = normalizeDecimalInput(raw);
    },
    setDeliveryDecimal: (
      field:
        | "quantity_kg"
        | "nolon_total"
        | "nolon_paid"
        | "nathriyat_total"
        | "nathriyat_paid",
      raw: string,
    ) => {
      deliveryForm[field] = normalizeDecimalInput(raw);
      if (field === "nolon_total") {
        nolonManualOverride.value = true;
        return;
      }
      if (field === "quantity_kg" && !nolonManualOverride.value) {
        deliveryForm.nolon_total = formatNolonAuto(
          parseDecimal(deliveryForm.quantity_kg),
        );
      }
    },
    setPaymentDecimal: (raw: string) => {
      paymentForm.amount = normalizeDecimalInput(raw);
    },
    nolonManualOverride,
    suggestedNolon,
    nolonRatePerTon: NOLON_RATE_PER_TON,
    reload: load,
  };
}
