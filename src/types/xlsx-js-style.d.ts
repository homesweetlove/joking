// xlsx-js-style is a drop-in, style-capable fork of SheetJS "xlsx" but ships
// without its own TypeScript definitions. We type it loosely as `any` so the
// familiar XLSX.* API (utils.aoa_to_sheet, utils.book_new, writeFile, etc.)
// plus the extra cell `.s` style property compile without needing the
// upstream `xlsx` package installed just for types.
declare module 'xlsx-js-style' {
  const XLSX: any;
  export = XLSX;
}
