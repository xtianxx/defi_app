"use client";

import { useState } from "react";
import { AddLiquidity } from "@/components/liquidity/AddLiquidity";
import { ActivePositions } from "@/components/liquidity/ActivePositions";

type Tab = "add" | "remove";

export default function LiquidityPage() {
  const [tab, setTab] = useState<Tab>("add");

  return (
    <div className="container mx-auto flex flex-col items-center px-4 py-8 sm:py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Liquidity</h1>

      {/* Tabs */}
      <div className="mb-6 flex w-full max-w-md rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("add")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "add"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setTab("remove")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "remove"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Remove
        </button>
      </div>

      {/* Tab content */}
      {tab === "add" ? (
        <AddLiquidity />
      ) : (
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-lg font-medium text-muted-foreground">
            Remove Liquidity — coming in Phase 5
          </p>
          <p className="mt-2 text-sm text-muted-foreground/70">
            The remove liquidity feature is currently under development.
          </p>
        </div>
      )}

      {/* Active positions list */}
      <div className="mt-6 w-full max-w-md">
        <ActivePositions />
      </div>
    </div>
  );
}
