import { useNavigate } from "react-router-dom";
import { LuSettings, LuX } from "react-icons/lu";
import { exitApp } from "tauri-plugin-app-exit-api";
import { Button } from "./ui/button";

export const ChatHeader = () => {
  const navigate = useNavigate();

  return (
    <header
      data-tauri-drag-region
      className="h-8 px-3 py-5 flex border-b border-border items-center justify-between bg-background select-none cursor-default z-10"
    >
      <div className="">
        <img src="/app-icon.png" className="w-4 h-4 mr-1 inline-block" />
        <span className="text-muted-foreground text-[12px] pointer-events-none">
          BloxChat
        </span>
      </div>

      <div className="flex gap-2">
        {/* <Button
          size={"icon"}
          variant={"ghost"}
          onClick={() => navigate("/settings")}
          className="p-1 text-primary hover:text-primary/70 transition-colors cursor-pointer"
        >
          <LuSettings size={16} />
        </Button> */}
        <Button
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
