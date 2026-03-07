import { useRef, useState } from "react";
import {
  PhysicalPosition,
  PhysicalSize,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { LuChevronDown, LuChevronUp, LuSettings, LuX } from "react-icons/lu";
import { exitApp } from "tauri-plugin-app-exit-api";
import { useNavigate } from "react-router-dom";
import {
  getWindowCollapseDirection,
  type WindowCollapseDirection,
} from "../lib/store";
import { Button } from "./ui/button";

const MIN_COLLAPSED_HEIGHT = 32;
const FALLBACK_COLLAPSED_HEIGHT = 40;

type WindowSize = {
  width: number;
  height: number;
};

export const ChatHeader = () => {
  const nav = useNavigate();
  const headerRef = useRef<HTMLElement | null>(null);
  const expandedSizeRef = useRef<WindowSize | null>(null);
  const collapsedHeightRef = useRef(FALLBACK_COLLAPSED_HEIGHT);
  const collapseDirectionRef = useRef<WindowCollapseDirection>("bottom");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTogglingCollapse, setIsTogglingCollapse] = useState(false);

  const toggleCollapsed = async () => {
    if (isTogglingCollapse) return;

    setIsTogglingCollapse(true);
    try {
      const appWindow = getCurrentWindow();
      const currentPosition = await appWindow.outerPosition();
      const currentSize = await appWindow.innerSize();
      const scaleFactor = await appWindow.scaleFactor();

      if (!isCollapsed) {
        const collapsedHeight = Math.max(
          MIN_COLLAPSED_HEIGHT,
          Math.round(
            headerRef.current?.getBoundingClientRect().height ??
              FALLBACK_COLLAPSED_HEIGHT,
          ),
        );
        const collapsedHeightPhysical = Math.max(
          1,
          Math.round(collapsedHeight * scaleFactor),
        );
        const collapseDirection = await getWindowCollapseDirection();

        expandedSizeRef.current = {
          width: currentSize.width,
          height: currentSize.height,
        };
        collapsedHeightRef.current = collapsedHeightPhysical;
        collapseDirectionRef.current = collapseDirection;

        await appWindow.setSize(
          new PhysicalSize(currentSize.width, collapsedHeightPhysical),
        );

        if (collapseDirection === "top") {
          await appWindow.setPosition(
            new PhysicalPosition(
              currentPosition.x,
              currentPosition.y +
                (currentSize.height - collapsedHeightPhysical),
            ),
          );
        }

        setIsCollapsed(true);
        return;
      }

      const expandedSize = expandedSizeRef.current;
      if (!expandedSize) {
        setIsCollapsed(false);
        return;
      }

      const collapsedHeight = collapsedHeightRef.current;
      const collapseDirection = collapseDirectionRef.current;
      const nextY =
        collapseDirection === "top"
          ? currentPosition.y - (expandedSize.height - collapsedHeight)
          : currentPosition.y;

      await appWindow.setSize(
        new PhysicalSize(expandedSize.width, expandedSize.height),
      );
      await appWindow.setPosition(
        new PhysicalPosition(currentPosition.x, nextY),
      );
      setIsCollapsed(false);
    } catch (error) {
      console.error("Failed to toggle collapsed mode:", error);
    } finally {
      setIsTogglingCollapse(false);
    }
  };

  const CollapseIcon = isCollapsed ? LuChevronDown : LuChevronUp;
  const collapseTitle = isCollapsed ? "Expand window" : "Collapse window";

  return (
    <header
      ref={headerRef}
      data-tauri-drag-region
      className={`h-8 px-3 py-5 flex ${!isCollapsed ? "border-b border-border" : ""} items-center justify-between bg-background select-none cursor-default z-10`}
    >
      <div className="">
        <img src="/app-icon.png" className="w-4 h-4 mr-1.5 inline-block" />
        <span className="text-primary text-xs pointer-events-none">
          BloxChat
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size={"icon"}
          variant={"ghost"}
          onClick={() => nav("/settings")}
          className="p-1 text-primary hover:text-primary/70 transition-colors cursor-pointer"
        >
          <LuSettings size={16} />
        </Button>
        <Button
          type="button"
          size={"icon"}
          variant={"ghost"}
          onClick={toggleCollapsed}
          disabled={isTogglingCollapse}
          title={collapseTitle}
          className="p-1 text-primary hover:text-primary/70 transition-colors cursor-pointer"
        >
          <CollapseIcon size={16} />
        </Button>
        <Button
          type="button"
          size={"icon"}
          variant={"ghost"}
          onClick={() => exitApp()}
          className="p-1 text-primary hover:text-primary/70 transition-colors cursor-pointer"
        >
          <LuX size={16} />
        </Button>
      </div>
    </header>
  );
};
