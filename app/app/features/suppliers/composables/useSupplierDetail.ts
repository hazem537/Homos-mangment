import type {
  Database,
  DeliveryCostKind,
  SupplierAccountType,
  TransferKind,
} from "~/types/database.types";
import { normalizeDecimalInput, parseDecimal } from "~/utils/formatNumber";
import {
  transferKindLabel,
  transferKindOptions,
} from "~/features/cash-transfers/composables/useCashTransfers";
import { supplierAccountTypeOptions } from "~/utils/supplierAccountType";
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
export type SupplierDelivery =
  Database["public"]["Tables"]["warehouse_deliveries"]["Row"] & {
    warehouses?: { id: string; name: string } | null;
    warehouse_sections?: { id: string; name: string; warehouse_id: string } | null;
  };

type WarehouseSectionLite = {
  id: string;
  name: string;
  warehouse_id: string;
};

type SeasonLite = { id: string; name: string; ardab_factor: number };
type WarehouseLite = { id: string; name: string };
type SupplierLite = {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  account_type: SupplierAccountType;
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
  const activeSeason = ref<SeasonLite | null>(null);
  const warehouses = ref<WarehouseLite[]>([]);
  const sections = ref<WarehouseSectionLite[]>([]);
  const purchases = ref<SupplierPurchase[]>([]);
  const transfers = ref<SupplierTransfer[]>([]);
  const deliveries = ref<SupplierDelivery[]>([]);
  const costPayments = ref<DeliveryCostPaymentLite[]>([]);

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
    warehouse_id: "" as string,
    section_id: "" as string,
    delivery_date: todayIsoDate(),
    quantity_kg: "" as string,
    nolon_total: "" as string,
    nolon_paid: "" as string,
    nathriyat_total: "" as string,
    nathriyat_paid: "" as string,
    vehicle_number: "",
    notes: "",
  });

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
    account_type: "normal" as SupplierAccountType,
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

  const warehouseOptions = computed(() =>
    warehouses.value.map((w) => ({ label: w.name, value: w.id })),
  );

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
    const rows = purchases.value;
    const nolonTotal = deliveries.value.reduce(
      (sum, d) => sum + Number(d.nolon_total || 0),
      0,
    );
    const nathriyatTotal = deliveries.value.reduce(
      (sum, d) => sum + Number(d.nathriyat_total || 0),
      0,
    );
    const commissionTotal = transfers.value
      .filter((t) => t.kind === "commission")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    if (!rows.length) {
      const costedTotal = nolonTotal + nathriyatTotal + commissionTotal;
      return { avgPrice: 0, lastPrice: 0, costedTotal };
    }
    const totalArdab = rows.reduce((sum, p) => sum + Number(p.ardab), 0);
    const purchasesTotal = rows.reduce(
      (sum, p) => sum + Number(p.total_price),
      0,
    );
    // Stats avg = (purchases + nolon + nathriyat + commission) / ardab
    const costedTotal =
      purchasesTotal + nolonTotal + nathriyatTotal + commissionTotal;
    const avgPrice =
      totalArdab > 0 ? Number((costedTotal / totalArdab).toFixed(4)) : 0;
    const lastPrice = Number(rows[rows.length - 1]?.price_per_ardab ?? 0);
    return { avgPrice, lastPrice, costedTotal };
  });

  const transferTotals = computed(() => {
    const rows = transfers.value;
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
    const rows = purchases.value;
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

  /** Live preview only while creating/editing inline (not persisted) */
  const computedPurchaseRunningAvg = computed(() => {
    const editingId = editingPurchase.value?.id ?? null;
    let sumArdab = 0;
    let sumMoney = 0;
    for (const p of purchases.value) {
      if (editingId && p.id === editingId) continue;
      sumArdab += Number(p.ardab);
      sumMoney += Number(p.total_price);
    }
    sumArdab += computedPurchaseArdab.value;
    sumMoney += computedPurchaseTotal.value;
    return sumArdab > 0 ? Number((sumMoney / sumArdab).toFixed(4)) : 0;
  });

  const deliveryTotals = computed(() => {
    const rows = deliveries.value;
    const kg = rows.reduce((sum, d) => sum + Number(d.quantity_kg), 0);
    const ardab = rows.reduce((sum, d) => sum + Number(d.ardab), 0);
    const nolon = rows.reduce((sum, d) => sum + Number(d.nolon_total || 0), 0);
    const nathriyat = rows.reduce(
      (sum, d) => sum + Number(d.nathriyat_total || 0),
      0,
    );
    const nolonPaid = costPayments.value
      .filter((p) => p.kind === "nolon" && !p.is_cancelled)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const nathriyatPaid = costPayments.value
      .filter((p) => p.kind === "nathriyat" && !p.is_cancelled)
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
   * Running purchase-kg need around each delivery:
   * before = remaining before this transfer, after = remaining after it.
   * While editing a row, uses live form kg for that row.
   */
  const deliveryKgRunningById = computed(() => {
    const map = new Map<string, { before: number; after: number }>();
    const editingId = editingDelivery.value?.id ?? null;
    let remaining = purchaseTotals.value.kg;
    for (const d of deliveries.value) {
      const transfer =
        editingId && d.id === editingId
          ? parseDecimal(deliveryForm.quantity_kg)
          : Number(d.quantity_kg);
      const before = Number(remaining.toFixed(4));
      const after = Number((before - transfer).toFixed(4));
      map.set(d.id, { before, after });
      remaining = after;
    }
    return map;
  });

  const deliveryKgRunningOf = (deliveryId: string) =>
    deliveryKgRunningById.value.get(deliveryId) ?? { before: 0, after: 0 };

  /** Preview for new delivery row (applied after all saved deliveries). */
  const deliveryCreateKgRunning = computed(() => {
    const before = Number(
      (purchaseTotals.value.kg - deliveryTotals.value.kg).toFixed(4),
    );
    const after = Number(
      (before - parseDecimal(deliveryForm.quantity_kg)).toFixed(4),
    );
    return { before, after };
  });

  /** Max kg allowed for current create/edit form (remaining before this row). */
  const deliveryMaxKgAllowed = computed(() => {
    if (isDeliveryCreating.value) return deliveryCreateKgRunning.value.before;
    const editingId = editingDelivery.value?.id;
    if (editingId) return deliveryKgRunningOf(editingId).before;
    return Number(
      (purchaseTotals.value.kg - deliveryTotals.value.kg).toFixed(4),
    );
  });

  /** Final remaining kg after all deliveries (uses live edit/create when open). */
  const deliveryKgRemainingFinal = computed(() => {
    if (isDeliveryCreating.value) return deliveryCreateKgRunning.value.after;
    const rows = deliveries.value;
    if (!rows.length) return purchaseTotals.value.kg;
    const last = rows[rows.length - 1];
    return deliveryKgRunningOf(last.id).after;
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

  /** Compact supplier header stats (replaces old 4 cards) */
  const supplierDetailStats = computed(() => {
    const kg = purchases.value.reduce(
      (sum, p) => sum + Number(p.quantity_kg),
      0,
    );
    const ardab = purchases.value.reduce(
      (sum, p) => sum + Number(p.ardab),
      0,
    );
    const paidTotal = transferTotals.value.amount;
    const supplierDue = Number(due.value?.balance ?? 0);
    const deliveryCostsDue =
      deliveryCostStats.value.nolonRest +
      deliveryCostStats.value.nathriyatRest;
    const grandDue = Number((supplierDue + deliveryCostsDue).toFixed(2));
    return {
      kg,
      ardab,
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

  /** Show «تسجيل تسليم» only when kg is still due */
  const canAddDelivery = computed(
    () => purchaseTotals.value.kg - deliveryTotals.value.kg > 0.001,
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
            .select("id, name")
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
    editingPurchase.value = null;
    purchaseForm.purchase_date = todayIsoDate();
    purchaseForm.quantity_kg = "";
    purchaseForm.price_per_ardab = "";
    purchaseForm.notes = "";
    purchaseInlineOpen.value = true;
  };

  const openPurchaseEdit = (row: SupplierPurchase) => {
    editingPurchase.value = row;
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
    if (!canAddDelivery.value) {
      toast.add({ title: "لا يوجد باقي كجم للتسليم", color: "warning" });
      return;
    }
    if (!(await ensureWarehousesLoaded())) return;
    if (!warehouses.value.length) {
      toast.add({
        title: "لا توجد شون",
        description: "أضف شونة قبل تسجيل تسليم",
        color: "warning",
      });
      return;
    }
    editingDelivery.value = null;
    deliveryForm.warehouse_id = warehouses.value[0]?.id || "";
    syncSectionForWarehouse();
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
    if (!(await ensureWarehousesLoaded())) return;
    editingDelivery.value = row;
    deliveryForm.warehouse_id = row.warehouse_id;
    deliveryForm.section_id = row.section_id;
    syncSectionForWarehouse();
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
      `حذف دفعة ${deliveryCostKindLabel(payment.kind)}؟`,
    );
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("delivery_cost_payments")
        .update({ is_cancelled: true })
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
    const quantityKg = parseDecimal(purchaseForm.quantity_kg);
    const pricePerArdab = parseDecimal(purchaseForm.price_per_ardab);
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

    // تحويل: cannot exceed remaining purchase due
    if (transferForm.kind === "transfer") {
      let maxAllowed = Number(due.value?.balance ?? 0);
      if (
        editingTransfer.value &&
        editingTransfer.value.kind !== "commission"
      ) {
        maxAllowed += Number(editingTransfer.value.amount);
      }
      maxAllowed = Number(maxAllowed.toFixed(2));
      if (amount > maxAllowed + 0.001) {
        toast.add({
          title: "المبلغ أكبر من المستحق",
          description: `المتبقي المتاح: ${maxAllowed.toFixed(2)} جنيه`,
          color: "warning",
        });
        return;
      }
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: supplier.value.id,
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
    const quantityKg = parseDecimal(deliveryForm.quantity_kg);
    if (!deliveryForm.warehouse_id) {
      toast.add({ title: "اختر الشونة", color: "warning" });
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
        title: "الكمية أكبر من المطلوب استلامه",
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

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: supplier.value.id,
      warehouse_id: deliveryForm.warehouse_id,
      section_id: deliveryForm.section_id,
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
        .update({ is_cancelled: true })
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
    const ok = await askConfirm("حذف عملية الشراء؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("purchases")
        .update({ is_cancelled: true })
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
    const ok = await askConfirm("حذف التحويل؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("cash_transfers")
        .update({ is_cancelled: true })
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
    const ok = await askConfirm("حذف التسليم؟");
    if (!ok) return;
    saving.value = true;
    try {
      const { error } = await client
        .from("warehouse_deliveries")
        .update({ is_cancelled: true })
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
    supplierEditForm.account_type = supplier.value.account_type || "normal";
    supplierEditModalOpen.value = true;
  };

  const saveSupplierEdit = async () => {
    if (!supplier.value) return;
    if (!supplierEditForm.name.trim()) {
      toast.add({ title: "الاسم مطلوب", color: "warning" });
      return;
    }
    saving.value = true;
    try {
      const payload = {
        name: supplierEditForm.name.trim(),
        notes: supplierEditForm.notes.trim() || null,
        account_type: supplierEditForm.account_type,
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
      const [supplierRes, seasonRes, warehousesRes, sectionsRes] =
        await Promise.all([
          client
            .from("suppliers")
            .select("id, name, notes, is_active, account_type")
            .eq("id", id)
            .maybeSingle(),
          client
            .from("seasons")
            .select("id, name, ardab_factor")
            .eq("is_active", true)
            .maybeSingle(),
          client
            .from("warehouses")
            .select("id, name")
            .eq("is_active", true)
            .order("name"),
          client
            .from("warehouse_sections")
            .select("id, name, warehouse_id")
            .eq("is_active", true)
            .order("name"),
        ]);
      if (supplierRes.error) throw supplierRes.error;
      if (seasonRes.error) throw seasonRes.error;
      if (warehousesRes.error) throw warehousesRes.error;
      if (sectionsRes.error) throw sectionsRes.error;

      supplier.value = supplierRes.data;
      activeSeason.value = seasonRes.data;
      warehouses.value = warehousesRes.data ?? [];
      sections.value = sectionsRes.data ?? [];

      if (!supplierRes.data || !seasonRes.data) {
        due.value = null;
        purchases.value = [];
        transfers.value = [];
        deliveries.value = [];
        costPayments.value = [];
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
            .select("*, warehouses(id, name), warehouse_sections(id, name, warehouse_id)")
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

      due.value = dueRes.data?.[0] ?? null;
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
      void load();
    },
    { immediate: true },
  );

  return {
    loading,
    saving,
    supplier,
    due,
    activeSeason,
    purchases,
    transfers,
    deliveries,
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
    sectionOptions,
    onDeliveryWarehouseChange,
    transferKindOptions,
    supplierAccountTypeOptions,
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
