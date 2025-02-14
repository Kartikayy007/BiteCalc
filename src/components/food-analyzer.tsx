"use client";

import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Camera, Upload, Sparkles, Scale, Ruler } from "lucide-react";
import Image from "next/image";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Progress } from "./ui/progress";
import { motion, AnimatePresence } from "framer-motion";

interface AnalysisResult {
  foodName: string;
  calories: number;
  confidence: number;
  details?: string;
  nutritionalInfo?: {
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
  };
  recommendations?: string[];
  needsClarification?: boolean;
}

interface UserProfile {
  weight?: number;
  height?: number;
  dailyCalorieGoal?: number;
}

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || "");

const generationConfig = {
  temperature: 0.7,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 8192,
};

export function FoodAnalyzer() {
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string>("");
  const [isClarifying, setIsClarifying] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [model, setModel] = useState<any>(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);

  const calculateDailyCalories = (weight: number, height: number) => {
    const bmr = 10 * weight + 6.25 * height - 5;
    return Math.round(bmr * 1.55);
  };

  const handleProfileUpdate = (weight?: number, height?: number) => {
    const newProfile: UserProfile = { weight, height };
    if (weight && height) {
      newProfile.dailyCalorieGoal = calculateDailyCalories(weight, height);
    }
    setUserProfile(newProfile);
  };

  useState(() => {
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(() => setIsCameraAvailable(true))
      .catch(() => setIsCameraAvailable(false));
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    setResult(null);
    setError(null);
    setClarification("");
    setIsClarifying(false);
  };

  const handleClarification = async () => {
    if (!clarification || !model) return;

    setIsClarifying(true);
    try {
      const result = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{ text: `Based on the clarification that this is "${clarification}", please provide an updated analysis in the format: name|calories|confidence|details` }]
        }]
      });

      const response = await result.response;
      const text = response.text().trim();
      console.log("Clarification Response:", text);

      const [foodName, calories, confidence, details] = text.split("|").map((item: string) => item.trim());

      setResult({
        foodName: foodName || "Unknown Food",
        calories: parseInt(calories) || 0,
        confidence: parseFloat(confidence) || 0.7,
        details: details || undefined,
        needsClarification: false
      });
    } catch (error: any) {
      console.error("Error during clarification:", error);
      setError(error?.message || "Failed to process clarification. Please try again.");
    } finally {
      setIsClarifying(false);
      setClarification("");
    }
  };

  const handleAnalyze = async () => {
    if (!imageFile) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const imageData = await imageFile.arrayBuffer();
      const imageBase64 = Buffer.from(imageData).toString("base64");

      const modelInstance = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig,
      });

      setModel(modelInstance);

      const userContext = userProfile.dailyCalorieGoal 
        ? `The user's daily calorie goal is ${userProfile.dailyCalorieGoal} calories.`
        : "";

      const prompt = `You are a friendly and enthusiastic AI nutritionist and food expert! 🍽️ Let's analyze this delicious food image in detail.

${userContext}

Please provide:
1. 🍳 The exact name of the food and all visible ingredients
2. 🔢 Estimated calories (as accurate as possible)
3. 📊 Your confidence level (0-1)
4. 🥗 Detailed nutritional breakdown including:
   - Protein (g)
   - Carbs (g)
   - Fats (g)
   - Fiber (g)
5. 💪 Health benefits and tips
6. 🎯 How this fits into a balanced diet

If you're not completely sure (confidence < 0.3), please indicate that you need clarification.

Format your response exactly as: name|calories|confidence|protein,carbs,fats,fiber|details|tips

Example: "Grilled Salmon with Quinoa|450|0.95|38,35,22,6|Fresh salmon fillet (6 oz) with 1 cup quinoa and roasted vegetables. Rich in omega-3 fatty acids, protein, and fiber.|Great choice for muscle recovery and brain health! Try adding more leafy greens for extra nutrients."`;

      const result = await modelInstance.generateContent({
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: imageFile.type,
                data: imageBase64
              }
            },
            { text: prompt }
          ]
        }]
      });

      const response = await result.response;
      const text = response.text().trim();
      console.log("Gemini Response:", text);

      const [foodName, calories, confidence, nutrition, details, tips] = text.split("|").map((item: string) => item.trim());
      const [protein, carbs, fats, fiber] = nutrition.split(",").map(n => parseFloat(n));
      const confidenceValue = parseFloat(confidence) || 0;

      setResult({
        foodName: foodName || "Unknown Food",
        calories: parseInt(calories) || 0,
        confidence: confidenceValue,
        details: details,
        nutritionalInfo: {
          protein,
          carbs,
          fats,
          fiber
        },
        recommendations: tips.split(". "),
        needsClarification: confidenceValue < 0.3
      });
    } catch (error: any) {
      console.error("Error analyzing image:", error);
      setError(error?.message || "Failed to analyze the image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleButtonClick = (type: 'upload' | 'camera') => {
    if (type === 'upload') {
      fileInputRef.current?.click();
    } else {
      cameraInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-8">
      <Card className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="food-image">Food Image</Label>
            <div className="grid gap-4">
              <div
                className="flex items-center justify-center w-full min-h-[200px] rounded-lg border border-dashed border-gray-600 dark:border-gray-700 relative overflow-hidden"
              >
                {image ? (
                  <Image
                    src={image}
                    alt="Uploaded food"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <div className="mx-auto flex items-center justify-center">
                      <Image
                        src="/placeholder-image.svg"
                        alt="Upload placeholder"
                        width={40}
                        height={40}
                        className="opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Take a photo or upload an image
                      </p>
                      <div className="flex gap-2 justify-center">
                        {isCameraAvailable && (
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={() => handleButtonClick('camera')}
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            Take Photo
                          </Button>
                        )}
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => handleButtonClick('upload')}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Image
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <Input
                ref={fileInputRef}
                id="food-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Input
                ref={cameraInputRef}
                id="food-image-camera"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={handleAnalyze}
            disabled={!image || isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                Analyzing...
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              </>
            ) : (
              "Analyze Food"
            )}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center mt-2">{error}</p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-xl font-semibold">Personal Profile</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowProfile(!showProfile)}
          >
            {showProfile ? "Hide" : "Show"}
          </Button>
        </div>
        
        <AnimatePresence>
          {showProfile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 opacity-50" />
                    <Input
                      id="weight"
                      type="number"
                      placeholder="Enter weight"
                      value={userProfile.weight || ""}
                      onChange={(e) => handleProfileUpdate(
                        parseFloat(e.target.value),
                        userProfile.height
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Height (cm)</Label>
                  <div className="flex items-center gap-2">
                    <Ruler className="w-4 h-4 opacity-50" />
                    <Input
                      id="height"
                      type="number"
                      placeholder="Enter height"
                      value={userProfile.height || ""}
                      onChange={(e) => handleProfileUpdate(
                        userProfile.weight,
                        parseFloat(e.target.value)
                      )}
                    />
                  </div>
                </div>
              </div>
              {userProfile.dailyCalorieGoal && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">
                    Estimated Daily Calorie Need: {userProfile.dailyCalorieGoal} kcal
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="p-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-yellow-500" />
                  {result.foodName}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Calories</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{result.calories}</span>
                        <span className="text-muted-foreground">kcal</span>
                        {userProfile.dailyCalorieGoal && (
                          <span className="text-sm text-muted-foreground ml-2">
                            ({Math.round((result.calories / userProfile.dailyCalorieGoal) * 100)}% of daily goal)
                          </span>
                        )}
                      </div>
                      {userProfile.dailyCalorieGoal && (
                        <Progress 
                          value={(result.calories / userProfile.dailyCalorieGoal) * 100} 
                          className="mt-2"
                        />
                      )}
                    </div>

                    <div>
                      <Label>Confidence</Label>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={result.confidence * 100}
                          className={
                            result.confidence < 0.3 
                              ? "text-yellow-500" 
                              : result.confidence < 0.7 
                                ? "text-blue-500" 
                                : "text-green-500"
                          }
                        />
                        <span className="text-sm font-medium">
                          {Math.round(result.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {result.nutritionalInfo && (
                    <div className="space-y-4">
                      <Label>Nutritional Breakdown</Label>
                      <div className="grid gap-2">
                        {Object.entries(result.nutritionalInfo).map(([nutrient, value]) => (
                          <div key={nutrient} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{nutrient}</span>
                              <span>{value}g</span>
                            </div>
                            <Progress value={(value / 100) * 100} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {result.details && (
                  <div className="mt-6">
                    <Label>Details</Label>
                    <p className="text-muted-foreground mt-1">{result.details}</p>
                  </div>
                )}

                {result.recommendations && (
                  <div className="mt-6">
                    <Label>Recommendations</Label>
                    <ul className="mt-2 space-y-2">
                      {result.recommendations.map((tip, index) => (
                        <motion.li
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-start gap-2"
                        >
                          <span className="text-green-500">•</span>
                          <span className="text-muted-foreground">{tip}</span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {result.needsClarification && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6"
                >
                  <div className="flex gap-2">
                    <Input
                      placeholder="Clarify what this food is..."
                      value={clarification}
                      onChange={(e) => setClarification(e.target.value)}
                    />
                    <Button 
                      onClick={handleClarification}
                      disabled={!clarification || isClarifying}
                    >
                      {isClarifying ? (
                        <>
                          Updating...
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        </>
                      ) : (
                        "Update Analysis"
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
} 