import { PendingPage } from "@/components/common/pending-page";

export default function ForecastingPage() {
  return (
    <PendingPage
      eyebrow="07 / ML Predictions"
      title="Forecasting Center"
      description="Short-term and 7-day forecasts, festival-risk calendar, and six ML model output cards (XGBoost, LightGBM, Prophet+XGBoost, Hybrid, LSTM, plus the live RandomForest classifier) with confidence gauges and an accuracy radar."
      wave="Wave C"
      topology="grid"
    />
  );
}
