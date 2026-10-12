"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingBasket, Receipt } from "lucide-react";

type Props = {
  purchase: React.ReactNode;
  sale: React.ReactNode;
};

export function PattiTabs({ purchase, sale }: Props) {
  const [tab, setTab] = useState<"purchase" | "sale">("purchase");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            {tab === "purchase" ? (
              <>
                <ShoppingBasket className="h-4 w-4 text-primary" />
                Patti bill — purchase from a seller
              </>
            ) : (
              <>
                <Receipt className="h-4 w-4 text-primary" />
                Patti bill — sale to a buyer
              </>
            )}
          </CardTitle>
          <div className="flex gap-1 rounded-md bg-muted/60 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={tab === "purchase" ? "default" : "ghost"}
              onClick={() => setTab("purchase")}
            >
              Purchase patti
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "sale" ? "default" : "ghost"}
              onClick={() => setTab("sale")}
            >
              Sale patti
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {tab === "purchase"
            ? "Record what you buy from a farmer or seller. Deductions reduce the net; brokerage may add or deduct."
            : "Sell from stock using patti-style adjustments. Bags are deducted from the chosen lot; the net is what the buyer owes."}
        </p>
      </CardHeader>
      <CardContent>{tab === "purchase" ? purchase : sale}</CardContent>
    </Card>
  );
}
