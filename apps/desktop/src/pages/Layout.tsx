import { Outlet } from "react-router-dom";
import { ChatHeader } from "../components/ChatHeader";

export const MainLayout = () => {
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-primary font-sans">
      <ChatHeader />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};
