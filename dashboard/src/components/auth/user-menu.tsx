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
          className="h-6 w-6 rounded-full object-cover border border-[#30363d]"
        />
      );
    }
    return (
      <div className="h-6 w-6 rounded-full bg-[#1f6feb] flex items-center justify-center text-xs font-semibold text-white">
        {getInitials(user.username)}
      </div>
    );
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="h-8 px-2 flex items-center gap-1.5 rounded-md hover:bg-[#21262d] border border-transparent hover:border-[#30363d] text-[#c9d1d9] hover:text-[#f0f6fc] transition-all cursor-pointer">
          <AvatarImage />
          <span className="text-xs font-medium max-w-[80px] truncate">
            {user.username}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[#8b949e]" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="w-[220px] bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl py-1 z-50 text-sm overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2 flex items-center gap-2 border-b border-[#30363d]">
            <AvatarImage />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-[#f0f6fc] truncate leading-tight">
                {user.username}
              </span>
              <span className="text-xs text-[#8b949e] truncate leading-tight mt-0.5">
                {user.email}
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="flex flex-col py-1">
            <Link
              href="/settings/profile"
              className="flex items-center gap-2 px-3 py-2 text-[#c9d1d9] hover:text-[#f0f6fc] hover:bg-white/[0.05] transition-colors"
            >
              <User className="h-4 w-4 text-[#8b949e]" />
              <span>Profile</span>
            </Link>
            
            <Link
              href="/settings/security"
              className="flex items-center gap-2 px-3 py-2 text-[#c9d1d9] hover:text-[#f0f6fc] hover:bg-white/[0.05] transition-colors"
            >
              <Lock className="h-4 w-4 text-[#8b949e]" />
              <span>Change password</span>
            </Link>

            <Link
              href="/settings/integrations"
              className="flex items-center gap-2 px-3 py-2 text-[#c9d1d9] hover:text-[#f0f6fc] hover:bg-white/[0.05] transition-colors"
            >
              <Github className="h-4 w-4 text-[#8b949e]" />
              <span>Connect GitHub</span>
            </Link>

            <div className="border-t border-[#30363d] my-1" />

            <button
              onClick={() => logout()}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-[#f85149] hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-[#f85149]" />
              <span>Sign out</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
