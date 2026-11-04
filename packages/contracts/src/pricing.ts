export interface TaxSettings {rateBps:number;inclusive:boolean;configured:boolean;version:number}
export function priceTotals(lines:{priceMinor:number;quantity:number}[],settings:Pick<TaxSettings,'rateBps'|'inclusive'>){
 if(!Number.isInteger(settings.rateBps)||settings.rateBps<0||settings.rateBps>10000)throw new Error('VALIDATION_ERROR');
 let subtotal=0n,tax=0n;const rate=BigInt(settings.rateBps);
 for(const line of lines){if(!Number.isSafeInteger(line.priceMinor)||!Number.isSafeInteger(line.quantity)||line.priceMinor<0||line.quantity<1)throw new Error('VALIDATION_ERROR');const amount=BigInt(line.priceMinor)*BigInt(line.quantity),denominator=settings.inclusive?10000n+rate:10000n;const lineTax=(amount*rate+denominator/2n)/denominator;tax+=lineTax;subtotal+=settings.inclusive?amount-lineTax:amount;}
 const total=subtotal+tax;if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('VALIDATION_ERROR');return {subtotalMinor:Number(subtotal),taxMinor:Number(tax),totalMinor:Number(total)};
}
