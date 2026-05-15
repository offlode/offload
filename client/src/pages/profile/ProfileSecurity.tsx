import { Loader2, QrCode, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { useProfileData } from "./useProfileData";

type ProfileDataReturn = ReturnType<typeof useProfileData>;

interface ProfileSecurityProps {
  twoFAOpen: ProfileDataReturn["twoFAOpen"];
  setTwoFAOpen: ProfileDataReturn["setTwoFAOpen"];
  twoFASetupMutation: ProfileDataReturn["twoFASetupMutation"];
  twoFASecret: ProfileDataReturn["twoFASecret"];
  twoFACode: ProfileDataReturn["twoFACode"];
  setTwoFACode: ProfileDataReturn["setTwoFACode"];
  twoFAVerifyMutation: ProfileDataReturn["twoFAVerifyMutation"];
  disable2FAOpen: ProfileDataReturn["disable2FAOpen"];
  setDisable2FAOpen: ProfileDataReturn["setDisable2FAOpen"];
  disable2FACode: ProfileDataReturn["disable2FACode"];
  setDisable2FACode: ProfileDataReturn["setDisable2FACode"];
  disable2FAMutation: ProfileDataReturn["disable2FAMutation"];
  toast: ProfileDataReturn["toast"];
}

export function ProfileSecurity({
  twoFAOpen, setTwoFAOpen,
  twoFASetupMutation, twoFASecret, twoFACode, setTwoFACode, twoFAVerifyMutation,
  disable2FAOpen, setDisable2FAOpen, disable2FACode, setDisable2FACode, disable2FAMutation,
  toast,
}: ProfileSecurityProps) {
  return (
    <>
      {/* 2FA Setup Sheet */}
      <Sheet open={twoFAOpen} onOpenChange={setTwoFAOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Enable Two-Factor Authentication</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {twoFASetupMutation.isPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Setting up...</span>
              </div>
            ) : twoFASecret ? (
              <>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  {twoFASecret.qrUrl ? (
                    <div className="flex justify-center mb-3">
                      <img
                        src={twoFASecret.qrUrl}
                        alt="2FA QR Code"
                        className="w-48 h-48 rounded-lg bg-white p-2"
                      />
                    </div>
                  ) : (
                    <Card className="p-4 mb-3">
                      <div className="flex items-center justify-center gap-2">
                        <QrCode className="w-5 h-5 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">QR code unavailable — use manual entry</p>
                      </div>
                    </Card>
                  )}
                  {twoFASecret.secret && (
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{twoFASecret.secret}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(twoFASecret.secret);
                          toast({ title: "Copied!", description: "Secret key copied to clipboard." });
                        }}
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Backup codes */}
                {twoFASecret.backupCodes.length > 0 && (
                  <Card className="p-4">
                    <p className="text-xs font-semibold mb-2">Backup Codes — save these somewhere safe</p>
                    <div className="grid grid-cols-2 gap-1">
                      {twoFASecret.backupCodes.map((code, i) => (
                        <code key={i} className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded text-center">{code}</code>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Verify */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Enter the 6-digit code from your app</Label>
                  <Input
                    value={twoFACode}
                    onChange={e => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 text-center text-lg font-mono tracking-widest"
                    maxLength={6}
                    data-testid="input-2fa-code"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={twoFACode.length !== 6 || twoFAVerifyMutation.isPending}
                  onClick={() => twoFAVerifyMutation.mutate()}
                  data-testid="button-verify-2fa"
                >
                  {twoFAVerifyMutation.isPending ? "Verifying..." : "Enable 2FA"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-destructive text-center">Failed to initialize 2FA setup. Please try again.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Disable 2FA Confirmation */}
      <AlertDialog open={disable2FAOpen} onOpenChange={setDisable2FAOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your current 6-digit authenticator code to disable 2FA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              value={disable2FACode}
              onChange={e => setDisable2FACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="h-12 text-center text-lg font-mono tracking-widest"
              maxLength={6}
              data-testid="input-disable-2fa-code"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDisable2FACode("")}
              data-testid="button-disable-2fa-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disable2FAMutation.mutate()}
              disabled={disable2FACode.length !== 6 || disable2FAMutation.isPending}
              className="bg-red-500 text-white hover:bg-red-600 focus:ring-red-500"
              data-testid="button-disable-2fa-confirm"
            >
              {disable2FAMutation.isPending ? "Disabling..." : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
