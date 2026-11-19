<script setup lang="ts">
/**
 * Standard Excel-like style ribbon for Handsontable workbooks.
 * Used by supplier detail, warehouse detail, and any future sheet pages.
 */
import {
  WORKBOOK_FONT_FAMILIES,
  WORKBOOK_FONT_SIZES,
  WORKBOOK_STANDARD_COLORS,
  WORKBOOK_THEME_COLORS,
  WORKBOOK_ZOOM_LEVELS,
  type WorkbookTextAlign
} from '~/utils/workbookStyleToolbar'

const props = defineProps<{
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  textAlign: WorkbookTextAlign
  textColor: string
  bgColor: string
  zoomPercent: number
}>()

const emit = defineEmits<{
  selectAll: []
  preserveSelection: []
  fontFamily: [family: string]
  fontSize: [size: number]
  bumpFontSize: [delta: number]
  toggleBold: []
  toggleItalic: []
  align: [align: WorkbookTextAlign]
  textColor: [color: string]
  bgColor: [color: string]
  zoom: [percent: number]
  bumpZoom: [delta: number]
}>()

const colorMenu = ref<'text' | 'fill' | null>(null)
const textColorPickerRef = ref<HTMLInputElement | null>(null)
const fillColorPickerRef = ref<HTMLInputElement | null>(null)

function toggleColorMenu(kind: 'text' | 'fill') {
  emit('preserveSelection')
  colorMenu.value = colorMenu.value === kind ? null : kind
}

function openMoreColors(kind: 'text' | 'fill') {
  emit('preserveSelection')
  const input = kind === 'text' ? textColorPickerRef.value : fillColorPickerRef.value
  input?.click()
}

function setTextColor(color: string) {
  emit('textColor', color)
  colorMenu.value = null
}

function setBgColor(color: string) {
  emit('bgColor', color)
  colorMenu.value = null
}

function onDocumentPointerDown(e: PointerEvent) {
  if (!colorMenu.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-color-menu]')) return
  colorMenu.value = null
}

/** Keep Handsontable selection when interacting with the ribbon (Excel behavior). */
function onToolbarMouseDown(e: MouseEvent) {
  emit('preserveSelection')
  const el = e.target as HTMLElement | null
  if (!el) return
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'OPTION' || el.closest('select, input')) {
    return
  }
  e.preventDefault()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div
    class="excel-ribbon relative z-20 flex shrink-0 flex-wrap items-stretch gap-0 overflow-visible border-b border-default bg-elevated/40"
    dir="rtl"
    @mousedown="onToolbarMouseDown"
  >
    <div class="flex items-center gap-2 border-e border-default px-3 py-1.5">
      <button
        type="button"
        class="h-7 rounded border border-default bg-default px-2 text-xs text-highlighted hover:bg-elevated"
        title="تحديد الكل"
        @click="emit('selectAll')"
      >
        تحديد الكل
      </button>
    </div>

    <div class="flex items-center gap-1 border-e border-default px-3 py-1.5">
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border border-default bg-default text-xs text-highlighted hover:bg-elevated"
        title="تصغير العرض"
        @click="emit('bumpZoom', -1)"
      >
        −
      </button>
      <select
        class="h-7 w-[4.25rem] rounded border border-default bg-default px-1 text-center text-xs text-highlighted"
        :value="zoomPercent"
        title="التكبير"
        @mousedown="emit('preserveSelection')"
        @change="emit('zoom', Number(($event.target as HTMLSelectElement).value))"
      >
        <option
          v-for="z in WORKBOOK_ZOOM_LEVELS"
          :key="z"
          :value="z"
        >
          {{ z }}%
        </option>
      </select>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border border-default bg-default text-xs text-highlighted hover:bg-elevated"
        title="تكبير العرض"
        @click="emit('bumpZoom', 1)"
      >
        +
      </button>
    </div>

    <div class="flex items-center gap-1 border-e border-default px-3 py-1.5">
      <select
        class="h-7 w-[9.5rem] rounded border border-default bg-default px-2 text-xs text-highlighted"
        :value="fontFamily"
        title="الخط"
        @mousedown="emit('preserveSelection')"
        @change="emit('fontFamily', ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="f in WORKBOOK_FONT_FAMILIES"
          :key="f.value"
          :value="f.value"
        >
          {{ f.label }}
        </option>
      </select>
      <div class="flex items-center rounded border border-default bg-default">
        <button
          type="button"
          class="flex size-7 items-center justify-center text-xs text-highlighted hover:bg-elevated"
          title="تصغير الخط"
          @click="emit('bumpFontSize', -1)"
        >
          A−
        </button>
        <select
          class="h-7 w-12 border-x border-default bg-transparent px-0.5 text-center text-xs text-highlighted"
          :value="fontSize"
          title="حجم الخط"
          @mousedown="emit('preserveSelection')"
          @change="emit('fontSize', Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="size in WORKBOOK_FONT_SIZES"
            :key="size"
            :value="size"
          >
            {{ size }}
          </option>
        </select>
        <button
          type="button"
          class="flex size-7 items-center justify-center text-xs text-highlighted hover:bg-elevated"
          title="تكبير الخط"
          @click="emit('bumpFontSize', 1)"
        >
          A+
        </button>
      </div>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border text-sm font-bold"
        :class="bold
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-default bg-default text-highlighted hover:bg-elevated'"
        title="عريض (Bold)"
        @click="emit('toggleBold')"
      >
        B
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border text-sm italic"
        :class="italic
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-default bg-default text-highlighted hover:bg-elevated'"
        title="مائل (Italic)"
        @click="emit('toggleItalic')"
      >
        I
      </button>
    </div>

    <div class="flex items-center gap-1 border-e border-default px-3 py-1.5">
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border"
        :class="textAlign === 'right'
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-default bg-default text-highlighted hover:bg-elevated'"
        title="محاذاة لليمين"
        @click="emit('align', 'right')"
      >
        <span class="flex w-3.5 flex-col items-end gap-0.5" aria-hidden="true">
          <span class="h-0.5 w-full rounded-full bg-current" />
          <span class="h-0.5 w-2.5 rounded-full bg-current" />
          <span class="h-0.5 w-full rounded-full bg-current" />
        </span>
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border"
        :class="textAlign === 'center'
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-default bg-default text-highlighted hover:bg-elevated'"
        title="محاذاة للوسط"
        @click="emit('align', 'center')"
      >
        <span class="flex w-3.5 flex-col items-center gap-0.5" aria-hidden="true">
          <span class="h-0.5 w-full rounded-full bg-current" />
          <span class="h-0.5 w-2.5 rounded-full bg-current" />
          <span class="h-0.5 w-full rounded-full bg-current" />
        </span>
      </button>
      <button
        type="button"
        class="flex size-7 items-center justify-center rounded border"
        :class="textAlign === 'left'
          ? 'border-primary bg-primary/15 text-primary'
          : 'border-default bg-default text-highlighted hover:bg-elevated'"
        title="محاذاة لليسار"
        @click="emit('align', 'left')"
      >
        <span class="flex w-3.5 flex-col items-start gap-0.5" aria-hidden="true">
          <span class="h-0.5 w-full rounded-full bg-current" />
          <span class="h-0.5 w-2.5 rounded-full bg-current" />
          <span class="h-0.5 w-full rounded-full bg-current" />
        </span>
      </button>
    </div>

    <div class="relative flex items-center gap-1 border-e border-default px-3 py-1.5" data-color-menu>
      <button
        type="button"
        class="flex h-7 min-w-8 flex-col items-center justify-center rounded border border-default bg-default px-1.5 hover:bg-elevated"
        :class="colorMenu === 'text' ? 'ring-2 ring-primary/40' : ''"
        title="لون النص"
        @click="toggleColorMenu('text')"
      >
        <span class="text-[13px] font-bold leading-none text-highlighted">A</span>
        <span
          class="mt-0.5 h-1 w-4 rounded-sm border border-default"
          :style="{ backgroundColor: textColor }"
        />
      </button>
      <input
        ref="textColorPickerRef"
        type="color"
        class="pointer-events-none absolute size-0 opacity-0"
        tabindex="-1"
        :value="textColor === '#ffffff' || textColor === '#FFFFFF' ? '#111827' : textColor"
        @mousedown="emit('preserveSelection')"
        @input="setTextColor(($event.target as HTMLInputElement).value)"
      >
      <div
        v-if="colorMenu === 'text'"
        class="excel-color-popover absolute start-0 top-full z-50 mt-1 w-[220px] rounded-md border border-default bg-default p-2 shadow-lg"
        dir="rtl"
      >
        <p class="mb-1.5 text-[11px] font-medium text-muted">
          ألوان النسق
        </p>
        <div class="mb-2 grid grid-cols-10 gap-0.5">
          <button
            v-for="c in WORKBOOK_THEME_COLORS"
            :key="`theme-fg-${c}`"
            type="button"
            class="size-5 rounded-sm border border-default"
            :class="textColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : ''"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="setTextColor(c)"
          />
        </div>
        <p class="mb-1.5 text-[11px] font-medium text-muted">
          ألوان قياسية
        </p>
        <div class="mb-2 grid grid-cols-10 gap-0.5">
          <button
            v-for="c in WORKBOOK_STANDARD_COLORS"
            :key="`std-fg-${c}`"
            type="button"
            class="size-5 rounded-sm border border-default"
            :class="textColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : ''"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="setTextColor(c)"
          />
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded border border-default bg-elevated/50 px-2 py-1.5 text-xs text-highlighted hover:bg-elevated"
          @click="openMoreColors('text')"
        >
          المزيد من الألوان…
        </button>
      </div>
    </div>

    <div class="relative flex items-center gap-1 px-3 py-1.5" data-color-menu>
      <button
        type="button"
        class="flex h-7 min-w-8 flex-col items-center justify-center rounded border border-default bg-default px-1.5 hover:bg-elevated"
        :class="colorMenu === 'fill' ? 'ring-2 ring-primary/40' : ''"
        title="لون التعبئة"
        @click="toggleColorMenu('fill')"
      >
        <span
          class="flex size-3.5 items-center justify-center rounded-sm border border-default text-[10px] leading-none text-highlighted"
          :style="{
            backgroundColor: bgColor === 'transparent' ? '#fff' : bgColor,
            backgroundImage: bgColor === 'transparent'
              ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
              : undefined,
            backgroundSize: bgColor === 'transparent' ? '4px 4px' : undefined,
            backgroundPosition: bgColor === 'transparent' ? '0 0, 2px 2px' : undefined
          }"
          aria-hidden="true"
        >■</span>
      </button>
      <input
        ref="fillColorPickerRef"
        type="color"
        class="pointer-events-none absolute size-0 opacity-0"
        tabindex="-1"
        :value="bgColor === 'transparent' ? '#fef08a' : bgColor"
        @mousedown="emit('preserveSelection')"
        @input="setBgColor(($event.target as HTMLInputElement).value)"
      >
      <div
        v-if="colorMenu === 'fill'"
        class="excel-color-popover absolute start-0 top-full z-50 mt-1 w-[220px] rounded-md border border-default bg-default p-2 shadow-lg"
        dir="rtl"
      >
        <button
          type="button"
          class="mb-2 flex w-full items-center gap-2 rounded border border-default px-2 py-1.5 text-xs text-highlighted hover:bg-elevated"
          :class="bgColor === 'transparent' ? 'ring-2 ring-primary ring-offset-1' : ''"
          @click="setBgColor('transparent')"
        >
          <span
            class="size-4 shrink-0 rounded-sm border border-default"
            style="background-image: linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%); background-size: 6px 6px; background-position: 0 0, 3px 3px; background-color: #fff;"
          />
          بدون تعبئة
        </button>
        <p class="mb-1.5 text-[11px] font-medium text-muted">
          ألوان النسق
        </p>
        <div class="mb-2 grid grid-cols-10 gap-0.5">
          <button
            v-for="c in WORKBOOK_THEME_COLORS"
            :key="`theme-bg-${c}`"
            type="button"
            class="size-5 rounded-sm border border-default"
            :class="bgColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : ''"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="setBgColor(c)"
          />
        </div>
        <p class="mb-1.5 text-[11px] font-medium text-muted">
          ألوان قياسية
        </p>
        <div class="mb-2 grid grid-cols-10 gap-0.5">
          <button
            v-for="c in WORKBOOK_STANDARD_COLORS"
            :key="`std-bg-${c}`"
            type="button"
            class="size-5 rounded-sm border border-default"
            :class="bgColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-1' : ''"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="setBgColor(c)"
          />
        </div>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded border border-default bg-elevated/50 px-2 py-1.5 text-xs text-highlighted hover:bg-elevated"
          @click="openMoreColors('fill')"
        >
          المزيد من الألوان…
        </button>
      </div>
    </div>
  </div>
</template>
