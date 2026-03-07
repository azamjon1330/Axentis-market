import {
  Home,
  ShoppingCart,
  User,
  Heart,
} from "lucide-react";

interface BottomNavigationProps {
  currentPage: "home" | "cart" | "likes" | "settings";
  onNavigate: (
    page: "home" | "cart" | "likes" | "settings",
  ) => void;
  cartItemsCount?: number;
  likesCount?: number;
  displayMode?: "day" | "night";
}

export default function BottomNavigation({
  currentPage,
  onNavigate,
  cartItemsCount = 0,
  likesCount = 0,
  displayMode = "day",
}: BottomNavigationProps) {
  const isNight = displayMode === "night";
  
  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[70] transition-colors duration-500 ${
      isNight ? "bg-[#C0BCBC]" : "bg-[#C0BCBC]"
    }`}>
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* Home Button */}
        <button
          onClick={() => onNavigate("home")}
          className={`flex-1 flex flex-col items-center justify-center py-4 transition-all duration-300 ${
            currentPage === "home"
              ? isNight ? "text-[#1a0b16] font-bold" : "text-black font-bold scale-110"
              : isNight ? "text-[#1a0b16]/70 hover:text-[#1a0b16]" : "text-black/60 hover:text-black"
          }`}
        >
          <Home
            className={`w-6 h-6 ${currentPage === "home" ? "fill-current" : ""}`}
          />
        </button>

        {/* Likes Button */}
        <button
          onClick={() => onNavigate("likes")}
          className={`flex-1 flex flex-col items-center justify-center py-4 transition-all duration-300 relative ${
            currentPage === "likes"
              ? isNight ? "text-[#1a0b16] font-bold" : "text-black font-bold scale-110"
              : isNight ? "text-[#1a0b16]/70 hover:text-[#1a0b16]" : "text-black/60 hover:text-black"
          }`}
        >
          <div className="relative">
            <Heart
              className={`w-6 h-6 ${currentPage === "likes" ? "fill-current" : ""}`}
            />
            {likesCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-pink-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {likesCount}
              </div>
            )}
          </div>
        </button>

        {/* Cart Button */}
        <button
          onClick={() => onNavigate("cart")}
          className={`flex-1 flex flex-col items-center justify-center py-4 transition-all duration-300 relative ${
            currentPage === "cart"
              ? isNight ? "text-[#1a0b16] font-bold" : "text-black font-bold scale-110"
              : isNight ? "text-[#1a0b16]/70 hover:text-[#1a0b16]" : "text-black/60 hover:text-black"
          }`}
        >
          <div className="relative bg-transparent">
            <ShoppingCart
              className={`w-6 h-6 ${currentPage === "cart" ? "fill-current" : ""}`}
            />
            {cartItemsCount > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {cartItemsCount}
              </div>
            )}
          </div>
        </button>

        {/* Settings Button (acting as User Profile icon in mockup) */}
        <button
          onClick={() => onNavigate("settings")}
          className={`flex-1 flex flex-col items-center justify-center py-4 transition-all duration-300 ${
            currentPage === "settings"
              ? isNight ? "text-[#1a0b16] font-bold" : "text-black font-bold scale-110"
              : isNight ? "text-[#1a0b16]/70 hover:text-[#1a0b16]" : "text-black/60 hover:text-black"
          }`}
        >
          <User
            className={`w-6 h-6 ${currentPage === "settings" ? "fill-current" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
