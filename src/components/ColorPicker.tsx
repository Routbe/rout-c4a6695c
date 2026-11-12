import { useState, forwardRef, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { NoneGlyph } from "./NoneGlyph";
import { SelectionIndicator } from "@/components/SelectionIndicator";
import { PickerAnnouncer } from "@/components/PickerAnnouncer";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HexColorPicker } from "react-colorful";

interface ColorPickerProps {
  fgColor: string;
  bgColor: string;
  onFgColorChange: (color: string) => void;
  onBgColorChange: (color: string) => void;
  onBgGradientClear?: () => void;
}

// 10 curated swatches for QR Code
const fgSwatches = [
  "#1a1a1a", // Near black
  "#3d3225", // Brown
  "#1e293b", // Slate dark
  "#2563eb", // Blue
  "#10b981", // Green
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f97316", // Orange
  "#eab308", // Yellow
  "#ffffff", // White
];

// 10 curated swatches for Background - vibrant pastels
const bgSwatches = [
  "#ffffff", // White
  "#fef3c7", // Warm yellow
  "#d1fae5", // Mint green
  "#a5f3fc", // Cyan
  "#bfdbfe", // Sky blue
  "#ddd6fe", // Lavender
  "#fbcfe8", // Pink
  "#fed7aa", // Peach
  "#1e293b", // Slate dark
  "#000000", // Black
];

const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex);

// Swatch size (36px) + gap (4px) - reduced for better fit
const SWATCH_SIZE = 36;
const GAP_SIZE = 4;
const PICKER_BUTTON_SIZE = 36;

// Color Swatch Button — shares the studio-wide selection badge.
const ColorSwatch = ({
  color,
  isSelected,
  onClick,
  label,
}: {
  color: string;
  isSelected: boolean;
  onClick: () => void;
  label?: string;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={isSelected}
    aria-label={label ?? color}
    title={label ?? color}
    tabIndex={isSelected ? 0 : -1}
    onClick={onClick}
    className={cn(
      "relative rounded-full transition-all duration-200 flex items-center justify-center flex-shrink-0 p-0.5 border overflow-visible",
      "w-9 h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      isSelected ? "border-foreground" : "border-transparent hover:bg-muted/50",
    )}
  >
    <SelectionIndicator visible={isSelected} />
    <div
      className={cn("w-full h-full rounded-full", color === "#ffffff" && "border border-border")}
      style={{ backgroundColor: color }}
    />
  </button>
);

// Trigger button with forwardRef for Radix compatibility
const ColorPickerTriggerButton = forwardRef<
  HTMLButtonElement,
  { currentColor: string; onClick?: () => void }
>(({ currentColor, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label="Aangepaste kleur kiezen"
    data-interface-color
    {...props}
    className="w-9 h-9 rounded-full transition-all duration-200 flex items-center justify-center flex-shrink-0 border border-border overflow-hidden"
    style={{
      background:
        "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
    }}
  />
));

ColorPickerTriggerButton.displayName = "ColorPickerTriggerButton";

// Standalone ColorPickerPopover component with tabs
interface ColorPickerPopoverProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  hexInput: string;
  onHexInputChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swatches: string[];
  isCustomSelected?: boolean;
}

function ColorPickerPopover({
  currentColor,
  onColorChange,
  hexInput,
  onHexInputChange,
  open,
  onOpenChange,
  swatches,
  isCustomSelected = false,
}: ColorPickerPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={true}>
      <PopoverTrigger asChild>
        {isCustomSelected ? (
          <button
            type="button"
            aria-label="Aangepaste kleur (geselecteerd)"
            className="relative w-9 h-9 rounded-full border border-foreground flex items-center justify-center p-0.5 flex-shrink-0 overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <SelectionIndicator visible />
            <div
              className={cn(
                "w-full h-full rounded-full",
                currentColor === "#ffffff" && "border border-border",
              )}
              style={{ backgroundColor: currentColor }}
            />
          </button>
        ) : (
          <ColorPickerTriggerButton currentColor={currentColor} />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 bg-card rounded-2xl" align="end">
        <Tabs defaultValue="swatches" className="w-[220px] min-h-[240px]">
          <TabsList className="grid w-full grid-cols-2 h-10 p-1 bg-[#F5F5F5] rounded-full">
            <TabsTrigger
              value="swatches"
              className="text-sm font-medium rounded-full data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
            >
              Stalen
            </TabsTrigger>
            <TabsTrigger
              value="custom"
              className="text-sm font-medium rounded-full data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground"
            >
              Aangepast
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swatches" className="mt-4">
            <div className="grid grid-cols-5 gap-1">
              {swatches.map((color) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  isSelected={currentColor === color}
                  onClick={() => {
                    onColorChange(color);
                    onHexInputChange(color);
                  }}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-4">
            <div className="space-y-4">
              {/* Color Picker */}
              <div className="color-picker-wrapper" onPointerDown={(e) => e.stopPropagation()}>
                <HexColorPicker
                  color={currentColor}
                  onChange={(color) => {
                    onColorChange(color.toUpperCase());
                    onHexInputChange(color.toUpperCase());
                  }}
                />
              </div>

              {/* Hex Input */}
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl border border-border flex-shrink-0"
                  style={{ backgroundColor: currentColor }}
                />
                <Input
                  value={hexInput}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    onHexInputChange(value);
                    if (isValidHex(value)) {
                      onColorChange(value);
                    }
                  }}
                  placeholder="#000000"
                  className="font-mono uppercase h-10 rounded-xl"
                  maxLength={7}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export function ColorPicker({
  fgColor,
  bgColor,
  onFgColorChange,
  onBgColorChange,
  onBgGradientClear,
}: ColorPickerProps) {
  const [fgHexInput, setFgHexInput] = useState(fgColor);
  const [bgHexInput, setBgHexInput] = useState(bgColor);
  const [fgOpen, setFgOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [visibleSwatches, setVisibleSwatches] = useState(10);
  const fgGroup = useRovingRadioGroup<HTMLDivElement>();
  const bgGroup = useRovingRadioGroup<HTMLDivElement>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate how many swatches can fit based on container width
  useEffect(() => {
    let rafId: number;

    const calculateVisibleSwatches = () => {
      // Use requestAnimationFrame to batch layout reads and avoid forced reflow
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        // Reserve space for the picker button
        const availableWidth = containerWidth - PICKER_BUTTON_SIZE - GAP_SIZE;
        const maxSwatches = Math.floor(availableWidth / (SWATCH_SIZE + GAP_SIZE));
        // Clamp between 3 and 10 swatches
        setVisibleSwatches(Math.max(3, Math.min(10, maxSwatches)));
      });
    };

    calculateVisibleSwatches();

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize calculations
      cancelAnimationFrame(rafId);
      calculateVisibleSwatches();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, []);

  const handleFgHexChange = (value: string) => {
    const formatted = value.startsWith("#") ? value : `#${value}`;
    setFgHexInput(formatted.toUpperCase());
    if (isValidHex(formatted)) {
      onFgColorChange(formatted.toUpperCase());
    }
  };

  const handleBgHexChange = (value: string) => {
    const formatted = value.startsWith("#") ? value : `#${value}`;
    setBgHexInput(formatted.toUpperCase());
    if (isValidHex(formatted)) {
      onBgColorChange(formatted.toUpperCase());
      onBgGradientClear?.();
    }
  };

  const handleBgSwatchClick = (color: string) => {
    onBgColorChange(color);
    setBgHexInput(color);
    onBgGradientClear?.();
  };

  // Get visible swatches based on calculated amount
  const visibleFgSwatches = fgSwatches.slice(0, visibleSwatches);
  const visibleBgSwatches = bgSwatches.slice(0, visibleSwatches);

  // Check if current color is a custom color (not in visible swatches)
  const isFgCustom = !visibleFgSwatches.includes(fgColor);
  const isBgCustom = bgColor !== "transparent" && !visibleBgSwatches.includes(bgColor);

  return (
    <div className="space-y-4 overflow-hidden w-full max-w-full" ref={containerRef}>
      <PickerAnnouncer
        message={`Foreground colour ${fgColor}, background ${bgColor === "transparent" ? "transparent" : bgColor} selected`}
      />
      {/* Foreground Color */}
      <div className="space-y-2 w-full">
        <p className="text-xs text-muted-foreground" id="fg-swatch-label">
          Voorgrond
        </p>

        <div
          role="radiogroup"
          aria-labelledby="fg-swatch-label"
          tabIndex={-1}
          ref={fgGroup.ref}
          onKeyDown={fgGroup.onKeyDown}
          className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:justify-between w-full overflow-visible pt-2"
        >
          {visibleFgSwatches.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              isSelected={fgColor === color}
              onClick={() => {
                onFgColorChange(color);
                setFgHexInput(color);
              }}
            />
          ))}
          {/* Custom color indicator or picker button */}
          <ColorPickerPopover
            currentColor={fgColor}
            onColorChange={(color) => {
              onFgColorChange(color);
              setFgHexInput(color);
            }}
            hexInput={fgHexInput}
            onHexInputChange={handleFgHexChange}
            open={fgOpen}
            onOpenChange={setFgOpen}
            swatches={fgSwatches}
            isCustomSelected={isFgCustom}
          />
        </div>
      </div>

      {/* Background Color */}
      <div className="space-y-2 w-full">
        <p className="text-xs text-muted-foreground" id="bg-swatch-label">
          Achtergrond
        </p>
        <div
          role="radiogroup"
          aria-labelledby="bg-swatch-label"
          tabIndex={-1}
          ref={bgGroup.ref}
          onKeyDown={bgGroup.onKeyDown}
          className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:justify-between w-full overflow-visible pt-2"
        >
          {/* Geen / transparante achtergrond */}
          <button
            type="button"
            role="radio"
            aria-checked={bgColor === "transparent"}
            aria-label="Geen achtergrond (transparant)"
            tabIndex={bgColor === "transparent" ? 0 : -1}
            onClick={() => handleBgSwatchClick("transparent")}
            title="Geen achtergrond (transparant)"
            className={cn(
              "relative rounded-full transition-all duration-200 flex items-center justify-center flex-shrink-0 p-0.5 border w-9 h-9 overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              bgColor === "transparent"
                ? "border-foreground"
                : "border-transparent hover:bg-muted/50",
            )}
          >
            <SelectionIndicator visible={bgColor === "transparent"} />
            <NoneGlyph size="sm" />
          </button>
          {visibleBgSwatches.slice(1).map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              isSelected={bgColor === color}
              onClick={() => handleBgSwatchClick(color)}
            />
          ))}

          {/* Custom color indicator or picker button */}
          <ColorPickerPopover
            currentColor={bgColor}
            onColorChange={(color) => {
              onBgColorChange(color);
              setBgHexInput(color);
              onBgGradientClear?.();
            }}
            hexInput={bgHexInput}
            onHexInputChange={handleBgHexChange}
            open={bgOpen}
            onOpenChange={setBgOpen}
            swatches={bgSwatches}
            isCustomSelected={isBgCustom}
          />
        </div>
      </div>

      <style>{`
        .color-picker-wrapper .react-colorful {
          width: 100%;
          height: 150px;
        }
        .color-picker-wrapper .react-colorful__saturation {
          border-radius: 12px;
          margin-bottom: 12px;
        }
        .color-picker-wrapper .react-colorful__hue {
          height: 14px;
          border-radius: 7px;
        }
        .color-picker-wrapper .react-colorful__saturation-pointer,
        .color-picker-wrapper .react-colorful__hue-pointer {
          width: 20px;
          height: 20px;
          border-width: 3px;
        }
      `}</style>
    </div>
  );
}
