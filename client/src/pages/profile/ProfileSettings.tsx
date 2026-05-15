import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fieldBorderClass } from "@/lib/inline-validation";
import { InlineFieldError } from "@/components/field-error";
import { useI18n } from "@/i18n";
import type { useProfileData } from "./useProfileData";

type ProfileDataReturn = ReturnType<typeof useProfileData>;

interface ProfileSettingsProps {
  editProfileOpen: ProfileDataReturn["editProfileOpen"];
  setEditProfileOpen: ProfileDataReturn["setEditProfileOpen"];
  editName: ProfileDataReturn["editName"];
  setEditName: ProfileDataReturn["setEditName"];
  editEmail: ProfileDataReturn["editEmail"];
  setEditEmail: ProfileDataReturn["setEditEmail"];
  editPhone: ProfileDataReturn["editPhone"];
  setEditPhone: ProfileDataReturn["setEditPhone"];
  profileFieldErrors: ProfileDataReturn["profileFieldErrors"];
  clearProfileError: ProfileDataReturn["clearProfileError"];
  handleSaveProfile: ProfileDataReturn["handleSaveProfile"];
  updateUserMutation: ProfileDataReturn["updateUserMutation"];
}

export function ProfileSettings({
  editProfileOpen, setEditProfileOpen,
  editName, setEditName, editEmail, setEditEmail, editPhone, setEditPhone,
  profileFieldErrors, clearProfileError, handleSaveProfile, updateUserMutation,
}: ProfileSettingsProps) {
  const { t } = useI18n();

  return (
    <Sheet open={editProfileOpen} onOpenChange={setEditProfileOpen}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl">
        <SheetHeader className="flex flex-row items-center gap-3 pb-2">
          <button
            onClick={() => setEditProfileOpen(false)}
            data-testid="button-back-personal-info"
            aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors active:scale-95 -ml-1"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <SheetTitle className="!mt-0">{t("profile_settings.title")}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("profile_settings.full_name")}</Label>
            <Input
              value={editName}
              onChange={e => { setEditName(e.target.value); clearProfileError("editName"); }}
              placeholder={t("profile_settings.full_name_placeholder")}
              className={`h-12 rounded-xl bg-card ${fieldBorderClass("editName", profileFieldErrors)}`}
              data-testid="input-edit-name"
              data-field="editName"
            />
            <InlineFieldError field="editName" errors={profileFieldErrors} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("profile_settings.email")}</Label>
            <Input
              type="email"
              value={editEmail}
              onChange={e => { setEditEmail(e.target.value); clearProfileError("editEmail"); }}
              placeholder={t("profile_settings.email_placeholder")}
              className={`h-12 rounded-xl bg-card ${fieldBorderClass("editEmail", profileFieldErrors)}`}
              data-testid="input-edit-email"
              data-field="editEmail"
            />
            <InlineFieldError field="editEmail" errors={profileFieldErrors} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">{t("profile_settings.phone")}</Label>
            <Input
              type="tel"
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              placeholder={t("profile_settings.phone_placeholder")}
              className="h-12 rounded-xl bg-card"
              data-testid="input-edit-phone"
            />
          </div>
          <Button
            className="w-full h-[50px] rounded-full font-semibold text-base mt-2"
            disabled={updateUserMutation.isPending}
            onClick={handleSaveProfile}
            data-testid="button-save-profile"
          >
            {updateUserMutation.isPending ? t("profile_settings.saving") : t("profile_settings.save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
