"use client";

import React from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { useAuth } from "@/lib/hooks/use-auth";
import { User, Lock, LogOut, ChevronDown } from "lucide-react";

function Github({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const AvatarImage = () => {
    if (user.avatarUrl) {
      return (
        <img
          src={user.avatarUrl}
          alt={user.username}
          className="h-6 w-6 rounded-full object-cover border border-white/20"
        />
      );
    }
    return (
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-success to-success/60 flex items-center justify-center text-[10px] font-black text-white shadow-inner">
        {getInitials(user.username)}
      </div>
    );
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="h-9 px-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] backdrop-blur-xl text-white hover:border-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
          <AvatarImage />
          <span className="text-xs font-bold max-w-[80px] truncate">
            {user.username}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={12}
          className="w-[240px] border border-white/10 rounded-2xl shadow-[0_24px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] py-1.5 z-50 text-sm overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(15, 22, 33, 0.45) 0%, rgba(8, 12, 18, 0.55) 100%)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10">
            <AvatarImage />
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-white truncate leading-tight">
                {user.username}
              </span>
              <span className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                {user.email}
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="flex flex-col py-1">
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors text-xs font-medium"
            >
              <User className="h-4 w-4 text-gray-400" />
              <span>Profile</span>
            </Link>
            
            <Link
              href="/settings/security"
              className="flex items-center gap-2 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors text-xs font-medium"
            >
              <Lock className="h-4 w-4 text-gray-400" />
              <span>Change password</span>
            </Link>

            <Link
              href="/settings/integrations"
              className="flex items-center gap-2 px-4 py-2.5 text-gray-300 hover:text-white hover:bg-white/[0.06] transition-colors text-xs font-medium"
            >
              <Github className="h-4 w-4 text-gray-400" />
              <span>Connect GitHub</span>
            </Link>

            <div className="border-t border-white/10 my-1" />

            <button
              onClick={() => logout()}
              className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-danger hover:bg-danger/10 hover:text-danger transition-colors cursor-pointer text-xs font-semibold"
            >
              <LogOut className="h-4 w-4 text-danger" />
              <span>Sign out</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
