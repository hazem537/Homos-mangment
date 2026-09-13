export function useArdab() {
  const kgToArdab = (kg: number, factor = 170) => {
    if (!factor) return 0
    return Number((kg / factor).toFixed(4))
  }

  const totalPrice = (ardab: number, pricePerArdab: number) => {
    return Number((ardab * pricePerArdab).toFixed(2))
  }

  return { kgToArdab, totalPrice }
}
