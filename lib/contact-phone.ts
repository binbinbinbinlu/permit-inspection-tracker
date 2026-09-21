// Remove phone formatting and invisible paste separators, but preserve invalid
// letters, extensions, and extra digits so validation can reject them.
export function normalizeContactPhone(value:string):string {
 const compact=value.replace(/[\s().\-\u200B-\u200D\uFEFF]/g,'');
 return compact.replace(/^\+?1([0-9]{10})$/,'$1');
}
