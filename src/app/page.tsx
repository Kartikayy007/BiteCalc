import { FoodAnalyzer } from "@/components/food-analyzer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto max-w-2xl py-8">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Food Calorie AI</h1>
          <p className="text-muted-foreground">
            Take a photo of your food to get instant calorie estimates
          </p>
        </div>
        <FoodAnalyzer />
      </main>
    </div>
  );
}
