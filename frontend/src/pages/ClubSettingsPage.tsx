import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/auth/AuthContext";
import * as clubApi from "@/api/club";
import { getErrorMessage } from "@/lib/errors";

export default function ClubSettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const isCoach = auth.user?.role === "coach";
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [city, setCity] = useState("");
  const [homeVenue, setHomeVenue] = useState("");
  const [foundedYear, setFoundedYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const c = await clubApi.getClub();
        if (cancelled) return;
        setName(c.name);
        setShortName(c.short_name ?? "");
        setCity(c.city ?? "");
        setHomeVenue(c.home_venue ?? "");
        setFoundedYear(c.founded_year != null ? String(c.founded_year) : "");
      } catch (e) {
        if (!cancelled) setErr(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!isCoach) return;
    setErr(null);
    setOk(false);
    setSaving(true);
    try {
      const fy = foundedYear.trim();
      await clubApi.updateClub({
        name: name.trim(),
        short_name: shortName.trim() || null,
        city: city.trim() || null,
        home_venue: homeVenue.trim() || null,
        founded_year: fy ? parseInt(fy, 10) : null,
      });
      setOk(true);
      window.dispatchEvent(new Event("club-updated"));
      if (isOnboarding) {
        navigate("/players", { replace: true });
      }
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Načítám klub…</div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-lg">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Profil klubu</CardTitle>
          <p className="text-sm text-muted-foreground">
            Základní údaje o vašem klubu. Vidí je všichni přihlášení uživatelé
            stejného účtu.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {err && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              {err}
            </div>
          )}
          {ok && (
            <div className="rounded-xl border border-green-600/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              Uloženo.
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="club-name" className="text-sm font-medium">
              Název klubu *
            </label>
            <Input
              id="club-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isCoach}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="short" className="text-sm font-medium">
              Zkratka
            </label>
            <Input
              id="short"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="např. FC Demo"
              disabled={!isCoach}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="city" className="text-sm font-medium">
              Město
            </label>
            <Input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!isCoach}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="venue" className="text-sm font-medium">
              Domácí stadion
            </label>
            <Input
              id="venue"
              value={homeVenue}
              onChange={(e) => setHomeVenue(e.target.value)}
              disabled={!isCoach}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="year" className="text-sm font-medium">
              Rok založení
            </label>
            <Input
              id="year"
              type="number"
              min={1800}
              max={2100}
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value)}
              disabled={!isCoach}
            />
          </div>

          {isCoach ? (
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? "Ukládám…" : "Uložit"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Úpravy profilu klubu může provádět pouze trenér.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
