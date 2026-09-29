import { PaymentResultScreen } from "@/features/shop/PaymentResultScreen";
import { param, titled, type PageProps } from "../../../metadata";

export const generateMetadata = () => titled("shop.coins.result.title");

// CO-04 Payment result (shop.md §4): the gateway return lands here with `?payment=<id>`.
export default async function PaymentResultPage({ searchParams }: PageProps) {
  const id = await param(searchParams, "payment");
  return <PaymentResultScreen paymentId={id && /^[\w-]{1,64}$/.test(id) ? id : null} />;
}
