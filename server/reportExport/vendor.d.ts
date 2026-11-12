// arabic-persian-reshaper ships no types: the one function used here (D-47 b).
declare module "arabic-persian-reshaper" {
  const reshaper: { ArabicShaper: { convertArabic(text: string): string } };
  export default reshaper;
}
