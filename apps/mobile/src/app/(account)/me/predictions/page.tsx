import { MyPredictionsScreen } from "@/features/predictions/MyPredictionsScreen";
import { titled } from "../../../metadata";

export const generateMetadata = () => titled("predict.mine.title");

// PR-04 My predictions (predictions.md §3.4).
export default function MyPredictionsPage() {
  return <MyPredictionsScreen />;
}
