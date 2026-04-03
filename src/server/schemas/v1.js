const { z } = require("zod");
const { ortak } = require("../middleware/validate");

const bos = z.object({}).passthrough();
const bosStringNulla = (deger) => (typeof deger === "string" && deger.trim() === "" ? null : deger);

/** En az 8 karakter, en az bir Unicode büyük harf, en az bir özel karakter (harf/rakam/boşluk dışı). */
const sifreGuclu = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalıdır.")
  .max(128)
  .refine((s) => /\p{Lu}/u.test(s), {
    message: "Şifrede en az bir büyük harf bulunmalıdır (ör. A, Ğ, Ş, İ).",
  })
  .refine((s) => /[^\p{L}\d\s]/u.test(s), {
    message: "Şifrede en az bir özel karakter bulunmalıdır (!, ?, @, #, _ vb.).",
  });

const limitQuery = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  arama: z.string().trim().max(120).optional(),
  sirala: z.string().trim().max(40).optional(),
  rol_id: z.coerce.number().int().min(1).max(3).optional(),
  aktif_durum: z.enum(["tum", "aktif", "pasif"]).optional(),
  durum: z.string().trim().max(40).optional(),
  kanal: z.string().trim().max(40).optional(),
  klinik: z.string().trim().max(120).optional(),
  gun: z.coerce.number().int().min(1).max(60).optional(),
});

const adminVeterinerOlustur = z.object({
  body: z.object({
    eposta: z.string().email(),
    sifre: sifreGuclu,
    ad: ortak.metin.max(100),
    soyad: ortak.metin.max(100),
    telefon: z.string().max(30).optional().nullable(),
    diploma_no: ortak.metin.max(100),
    klinik_adi: z.string().max(150).optional().nullable(),
    klinik_kodu: z.string().trim().max(80).optional().nullable(),
    uzmanlik_alani: z.string().max(150).optional().nullable(),
    il: z.string().max(100).optional().nullable(),
    ilce: z.string().max(100).optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const adminVeterinerGuncelle = z.object({
  body: z
    .object({
      ad: z.string().trim().min(1).max(100).optional(),
      soyad: z.string().trim().min(1).max(100).optional(),
      telefon: z.string().max(30).optional().nullable(),
      eposta: z.string().email().optional(),
      aktif: z.boolean().optional(),
      diploma_no: z.string().trim().min(1).max(100).optional(),
      klinik_adi: z.string().max(150).optional().nullable(),
      klinik_kodu: z.string().trim().max(80).optional().nullable(),
      uzmanlik_alani: z.string().max(150).optional().nullable(),
      il: z.string().max(100).optional().nullable(),
      ilce: z.string().max(100).optional().nullable(),
    })
    .refine((x) => Object.keys(x).length > 0, "En az bir alan gonderilmeli."),
  params: z.object({ id: ortak.uuid }),
  query: bos,
});

const adminKullaniciDurumGuncelle = z.object({
  body: z.object({
    aktif: z.boolean(),
  }),
  params: z.object({ id: ortak.uuid }),
  query: bos,
});

const adminKullaniciSifreDegistir = z.object({
  body: z.object({
    yeni_sifre: sifreGuclu,
  }),
  params: z.object({ id: ortak.uuid }),
  query: bos,
});

const adminKullaniciSil = z.object({
  body: z.object({
    kalici: z.boolean().optional().default(false),
    onay_metni: z.string().trim().max(20).optional().nullable(),
  }),
  params: z.object({ id: ortak.uuid }),
  query: bos,
});

const sayisalIdParam = z.object({
  body: bos,
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const hayvanIdParam = z.object({
  body: bos,
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: limitQuery.optional().default({}),
});

const sahipTakipVeterinerUuidParam = z.object({
  body: bos,
  params: z.object({ veterinerId: ortak.uuid }),
  query: bos,
});

const sahipRandevuOlustur = z.object({
  body: z.object({
    hayvan_id: ortak.pozitifInt,
    veteriner_id: ortak.uuid,
    randevu_tarihi: ortak.tarih,
    randevu_saati: ortak.saat,
    sikayet_ozet: z.string().max(1000).optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const sahipAiOnYonlendirme = z.object({
  body: z.object({
    hayvan_id: ortak.pozitifInt,
    sikayet_ozet: ortak.metin.max(2000),
    semptom_suresi_saat: z.coerce.number().int().min(0).max(24 * 30).optional().nullable(),
    kusma_sayisi: z.coerce.number().int().min(0).max(30).optional().nullable(),
    ishal_var: z.boolean().optional().nullable(),
    istah_durumu: z.enum(["normal", "azaldi", "hic_yemiyor"]).optional().nullable(),
    aktivite_durumu: z.enum(["normal", "azaldi", "cok_dusuk"]).optional().nullable(),
    su_tuketimi: z.enum(["normal", "azaldi", "hic_icmiyor"]).optional().nullable(),
    ates_var: z.boolean().optional().nullable(),
    travma_oykusu: z.boolean().optional().nullable(),
    nobet_var: z.boolean().optional().nullable(),
    solunum_sikintisi: z.boolean().optional().nullable(),
    kanama_var: z.boolean().optional().nullable(),
    zehirlenme_suphesi: z.boolean().optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const sahipRandevuOneri = z.object({
  body: z.object({
    hayvan_id: ortak.pozitifInt,
    veteriner_id: ortak.uuid.optional().nullable(),
    tarih: ortak.tarih.optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const sahipRandevuIptal = z.object({
  body: z.object({ iptal_nedeni: z.string().max(500).optional().nullable() }),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuIptal = z.object({
  body: z.object({ iptal_nedeni: z.string().max(500).optional().nullable() }),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuNoShow = z.object({
  body: z.object({ no_show_nedeni: z.string().max(500).optional().nullable() }),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuTamamlaBody = z
  .object({
    islem_turu: ortak.metin.max(120),
    tani_notu: z.string().max(5000).optional().nullable(),
    subjective: z.string().max(5000).optional().nullable(),
    objective: z.string().max(5000).optional().nullable(),
    assessment: z.string().max(5000).optional().nullable(),
    plan: z.string().max(5000).optional().nullable(),
    takip_kontrol_tarihi: z.preprocess(
      bosStringNulla,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
    ),
    taburculuk_notu: z.string().max(5000).optional().nullable(),
    triage_seviyesi: z.enum(["dusuk", "orta", "yuksek", "kritik"]).optional().nullable(),
    ates_c: z.coerce.number().min(30).max(45).optional().nullable(),
    nabiz: z.coerce.number().int().min(20).max(320).optional().nullable(),
    solunum_sayisi: z.coerce.number().int().min(5).max(200).optional().nullable(),
    kilo_kg: z.coerce.number().positive().max(500).optional().nullable(),
    asi_uygulandi: z.boolean().optional().default(false),
    asi_adi: z.string().max(100).optional().nullable(),
    tekrar_gun_sayisi: z.coerce.number().int().positive().max(3650).optional().nullable(),
    asi_notu: z.string().max(5000).optional().nullable(),
    checkout_ile_kapat: z.boolean().optional().default(false),
  })
  .superRefine((deger, ctx) => {
    if (deger.asi_uygulandi) {
      if (!deger.asi_adi || !deger.asi_adi.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["asi_adi"],
          message: "Asi uygulandiysa asi_adi zorunludur.",
        });
      }
      if (deger.tekrar_gun_sayisi == null || Number(deger.tekrar_gun_sayisi) <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tekrar_gun_sayisi"],
          message: "Asi uygulandiysa tekrar_gun_sayisi zorunludur.",
        });
      }
    }
  });

const veterinerRandevuTamamla = z.object({
  body: veterinerRandevuTamamlaBody,
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuDurumGuncelle = z.object({
  body: z.object({
    durum: z.enum(["geldi", "muayenede"]),
  }),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuCheckout = z.object({
  body: bos,
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerRandevuIlerlet = z.object({
  body: bos,
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerHizliMesaj = z.object({
  body: z.object({
    sahibi_id: ortak.uuid,
    hayvan_id: ortak.pozitifInt,
    mesaj: ortak.metin.max(1500),
    kanal: z.enum(["push", "whatsapp", "sms"]).optional().default("push"),
    sablon_adi: z.string().trim().max(80).optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const veterinerMesajSablonOlustur = z.object({
  body: z.object({
    ad: ortak.metin.max(80),
    kanal: z.enum(["push", "whatsapp", "sms"]).optional().default("whatsapp"),
    icerik: ortak.metin.max(1500),
    aktif: z.boolean().optional().default(true),
  }),
  params: bos,
  query: bos,
});

const veterinerMesajSablonGuncelle = z.object({
  body: z
    .object({
      ad: z.string().trim().min(1).max(80).optional(),
      kanal: z.enum(["push", "whatsapp", "sms"]).optional(),
      icerik: z.string().trim().min(1).max(1500).optional(),
      aktif: z.boolean().optional(),
    })
    .refine((x) => Object.keys(x).length > 0, "En az bir alan gonderilmeli."),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const veterinerIletisimAyarGuncelle = z.object({
  body: z
    .object({
      klinik_kodu: z.string().trim().min(3).max(80).optional(),
      provider: z.enum(["mock", "webhook", "twilio", "infobip"]).optional(),
      twilio_account_sid: z.string().trim().max(120).optional().nullable(),
      twilio_auth_token: z.string().trim().max(200).optional().nullable(),
      twilio_whatsapp_from: z.string().trim().max(30).optional().nullable(),
      webhook_url: z.string().trim().url().max(500).optional().nullable(),
      webhook_token: z.string().trim().max(200).optional().nullable(),
      infobip_base_url: z.string().trim().url().max(500).optional().nullable(),
      infobip_api_key: z.string().trim().max(300).optional().nullable(),
      infobip_sender: z.string().trim().max(80).optional().nullable(),
      aktif: z.boolean().optional(),
    })
    .refine((x) => Object.keys(x).length > 0, "En az bir alan gonderilmeli."),
  params: bos,
  query: bos,
});

const veterinerIletisimAyarTest = z.object({
  body: z.object({
    telefon: z.string().trim().min(8).max(30),
    kanal: z.enum(["whatsapp", "sms"]).optional().default("whatsapp"),
    mesaj: z.string().trim().min(3).max(500).optional(),
  }),
  params: bos,
  query: bos,
});

const mesajOdaOlustur = z.object({
  body: z
    .object({
      hayvan_id: ortak.pozitifInt,
      sahibi_id: ortak.uuid.optional(),
      veteriner_id: ortak.uuid.optional(),
    })
    .refine((x) => Boolean(x.sahibi_id) !== Boolean(x.veteriner_id), "sahibi_id veya veteriner_id alanlarindan yalnizca biri gonderilmelidir."),
  params: bos,
  query: bos,
});

const mesajOdaIdParam = z.object({
  body: bos,
  params: z.object({ odaId: ortak.pozitifInt }),
  query: limitQuery.optional().default({}),
});

const mesajGonder = z.object({
  body: z
    .object({
      icerik: z.string().trim().max(3000).optional().nullable(),
      medya_url: z
        .string()
        .trim()
        .max(700)
        .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith("mesaj-medya:"), "gecersiz_medya_url")
        .optional()
        .nullable(),
      yanit_mesaj_id: z.coerce.number().int().positive().optional().nullable(),
      yanit_ozet: z.string().trim().max(500).optional().nullable(),
    })
    .refine((x) => Boolean(x.icerik && x.icerik.trim()) || Boolean(x.medya_url), "icerik veya medya_url alanlarindan en az biri gonderilmelidir."),
  params: z.object({ odaId: ortak.pozitifInt }),
  query: bos,
});

const mesajDuzenle = z.object({
  body: z.object({
    icerik: ortak.metin.max(3000),
  }),
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const mesajSil = z.object({
  body: bos,
  params: z.object({ id: ortak.pozitifInt }),
  query: bos,
});

const bildirimTopluOkundu = z.object({
  body: bos,
  params: bos,
  query: bos,
});

const sahipHayvanOlustur = z.object({
  body: z.object({
    ad: ortak.metin.max(120),
    tur: ortak.metin.max(80),
    irk: z.string().max(120).optional().nullable(),
    cinsiyet: z.string().max(20).optional().nullable(),
    kan_grubu: z.string().max(20).optional().nullable(),
    dogum_tarihi: z.preprocess(
      bosStringNulla,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
    ),
    kilo: z.coerce.number().positive().max(500).optional().nullable(),
    kisirlastirma_durumu: z.boolean().optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const sahipHayvanGuncelle = z.object({
  body: z
    .object({
      ad: ortak.metin.max(120).optional(),
      tur: ortak.metin.max(80).optional(),
      irk: z.string().max(120).optional().nullable(),
      cinsiyet: z.string().max(20).optional().nullable(),
      kan_grubu: z.string().max(20).optional().nullable(),
      dogum_tarihi: z.preprocess(
        bosStringNulla,
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
      ),
      kilo: z.coerce.number().positive().max(500).optional().nullable(),
      kisirlastirma_durumu: z.boolean().optional().nullable(),
      topluluk_patisi_goster: z.boolean().optional(),
    })
    .refine((x) => Object.keys(x).length > 0, { message: "En az bir alan gonderilmeli." }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const sahipKayitOl = z.object({
  body: z.object({
    ad: ortak.metin.max(100),
    soyad: ortak.metin.max(100),
    telefon: z
      .string()
      .trim()
      .min(8, "En az 8 karakter girin (ör. 05xx veya +90).")
      .max(30, "Telefon çok uzun.")
      .regex(/^[0-9+\s().-]{8,30}$/, "Telefon yalnızca rakam, +, boşluk, tire ve parantez içerebilir."),
    eposta: z
      .string()
      .trim()
      .min(3, "E-posta girin.")
      .email({ message: "Geçerli bir e-posta adresi girin." })
      .max(200)
      .transform((s) => s.toLowerCase()),
    sifre: sifreGuclu,
    kvkk_acik_riza_onay: z.boolean().refine((v) => v === true, {
      message: "KVKK / açık rıza metnini okuyup onaylamanız zorunludur.",
    }),
    pazarlama_riza: z.boolean().optional(),
  }),
  params: bos,
  query: bos,
});

const adminYasalMetinGuncelle = z.object({
  body: z.object({
    guncellemeler: z
      .array(
        z
          .object({
            anahtar: z.enum(["kvkk_aydinlatma", "gizlilik_politikasi", "acik_riza_metni"]),
            baslik: z.string().max(240).optional(),
            icerik: z.string().max(100_000).optional(),
          })
          .refine((x) => x.baslik !== undefined || x.icerik !== undefined, {
            message: "Her kayit icin baslik veya icerik gonderilmeli.",
          })
      )
      .min(1),
  }),
  params: bos,
  query: bos,
});

const veterinerHastaOlustur = z.object({
  body: z
    .object({
      sahibi_id: ortak.uuid,
      hayvan_id: ortak.pozitifInt.optional(),
      ad: ortak.metin.max(120).optional(),
      tur: ortak.metin.max(80).optional(),
      irk: z.string().max(120).optional().nullable(),
      cinsiyet: z.string().max(20).optional().nullable(),
      kan_grubu: z.string().max(20).optional().nullable(),
      dogum_tarihi: z.preprocess(
        bosStringNulla,
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
      ),
      kilo: z.coerce.number().positive().max(500).optional().nullable(),
      kisirlastirma_durumu: z.boolean().optional().nullable(),
    })
    .refine((x) => Boolean(x.hayvan_id) || (Boolean(x.ad) && Boolean(x.tur)), "Mevcut hayvan secin veya ad ve tur girin."),
  params: bos,
  query: bos,
});

const veterinerSahipHizliOlustur = z.object({
  body: z.object({
    ad: ortak.metin.max(100),
    soyad: ortak.metin.max(100),
    telefon: ortak.metin.max(30),
    eposta: z.string().email().max(200).optional().nullable(),
  }),
  params: bos,
  query: bos,
});

const saglikKaydiEkle = z.object({
  body: z.object({
    islem_turu: ortak.metin.max(100),
    tani_notu: z.string().max(5000).optional().nullable(),
    hassas_mi: z.boolean().optional().default(false),
    islem_tarihi: z.string().datetime(),
  }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const hayvanSil = z.object({
  body: z.object({
    kalici: z.boolean().optional().default(false),
    onay_metni: z.string().trim().max(20).optional().nullable(),
  }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const asiKaydiEkle = z.object({
  body: z.object({
    asi_adi: ortak.metin.max(100),
    uygulama_tarihi: ortak.tarih,
    tekrar_gun_sayisi: z.coerce.number().int().positive().max(3650),
    notlar: z.string().max(5000).optional().nullable(),
    saglik_kaydi_id: z.coerce.number().int().positive().optional().nullable(),
  }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const receteIlacKalemi = z.object({
  ilac_adi: ortak.metin.max(150),
  doz: z.string().max(100).optional().nullable(),
  kullanim_sikligi: z.string().max(120).optional().nullable(),
  sure_gun: z.coerce.number().int().positive().max(365).optional().nullable(),
  notlar: z.string().max(500).optional().nullable(),
});

const veterinerReceteOlustur = z.object({
  body: z.object({
    recete_metni: ortak.metin.max(5000),
    tani: z.string().max(500).optional().nullable(),
    recete_tarihi: ortak.tarih.optional().nullable(),
    ilaclar: z.array(receteIlacKalemi).max(25).optional().default([]),
  }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const hayvanKimlikGuncelle = z.object({
  body: z
    .object({
      foto_url: z
        .string()
        .trim()
        .max(500)
        .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith("hayvan-kimlik-fotolari:"), "gecersiz_foto_url")
        .optional()
        .nullable(),
      imza_url: z
        .string()
        .trim()
        .max(500)
        .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith("hayvan-kimlik-fotolari:"), "gecersiz_imza_url")
        .optional()
        .nullable(),
      pdf_url: z
        .string()
        .trim()
        .max(500)
        .refine((v) => !v || /^https?:\/\//i.test(v) || v.startsWith("hayvan-kimlik-pdf:"), "gecersiz_pdf_url")
        .optional()
        .nullable(),
      qr_icerik: z.string().url().max(700).optional().nullable(),
      qr_dogrulama_token: z.string().trim().min(16).max(120).optional().nullable(),
      kimlik_notu: z.string().max(500).optional().nullable(),
      mikrocip_no: z.string().trim().max(80).optional().nullable(),
      kayip_hayvan_iletisim_izni: z.boolean().optional(),
      kayip_hayvan_notu: z.string().max(500).optional().nullable(),
      sahibi_telefon: z.string().max(30).optional().nullable(),
      sahibi_adres: z.string().max(500).optional().nullable(),
      sahibi_il: z.string().max(100).optional().nullable(),
      sahibi_ilce: z.string().max(100).optional().nullable(),
      sahibi_acil_durum_iletisim: z.string().max(30).optional().nullable(),
      hayvan_tur: z.string().max(80).optional().nullable(),
      hayvan_irk: z.string().max(120).optional().nullable(),
      hayvan_cinsiyet: z.string().max(20).optional().nullable(),
      hayvan_kan_grubu: z.string().max(20).optional().nullable(),
      hayvan_dogum_tarihi: z.preprocess(
        bosStringNulla,
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
      ),
      hayvan_kilo: z.coerce.number().positive().max(500).optional().nullable(),
    })
    .refine((x) => Object.keys(x).length > 0, "En az bir alan gonderilmeli."),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const hayvanKimlikDosyaYukle = z.object({
  body: z.object({
    tur: z.enum(["foto", "imza", "pdf"]),
    content_type: z.string().trim().min(3).max(120),
    data_url: z.string().trim().min(30).max(3_000_000),
    dosya_adi: z.string().trim().max(120).optional().nullable(),
  }),
  params: z.object({ hayvanId: ortak.pozitifInt }),
  query: bos,
});

const kimlikIletisimTalebi = z.object({
  body: z.object({
    bulan_ad: ortak.metin.max(120),
    bulan_telefon: ortak.metin.max(30),
    mesaj: ortak.metin.max(700),
  }),
  params: z.object({ kimlikNo: z.string().trim().min(8).max(120) }),
  query: z.object({ t: z.string().trim().min(16).max(180) }),
});

const kimlikKonumBildir = z.object({
  body: z.object({
    enlem: z.coerce.number().min(-90).max(90),
    boylam: z.coerce.number().min(-180).max(180),
    dogruluk_metre: z.coerce.number().min(0).max(500000).optional().nullable(),
  }),
  params: z.object({ kimlikNo: z.string().trim().min(8).max(120) }),
  query: z.object({ t: z.string().trim().min(16).max(180) }),
});

const limitOnly = z.object({ body: bos, params: bos, query: limitQuery.optional().default({}) });

const cihazFcmKayit = z.object({
  body: z.object({
    fcm_token: z.string().trim().min(10).max(4096),
    platform: z.enum(["android", "ios", "web"]).optional(),
  }),
  params: bos,
  query: bos,
});

const sahipProfilFotoYukle = z.object({
  body: z.object({
    content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data_url: z.string().trim().min(30).max(2_500_000),
  }),
  params: bos,
  query: bos,
});

const veterinerProfilFotoYukle = sahipProfilFotoYukle;

const veterinerProfilGuncelle = z.object({
  body: z
    .object({
      klinik_adi: z.string().max(150).optional(),
      uzmanlik_alani: z.string().max(150).optional(),
      il: z.string().max(100).optional(),
      ilce: z.string().max(100).optional(),
      calisma_saatleri_metin: z.string().max(500).optional(),
    })
    .refine((x) => Object.keys(x).length > 0, "En az bir alan gonderilmelidir."),
  params: bos,
  query: bos,
});

module.exports = {
  adminYasalMetinGuncelle,
  adminVeterinerOlustur,
  adminVeterinerGuncelle,
  adminKullaniciDurumGuncelle,
  adminKullaniciSifreDegistir,
  adminKullaniciSil,
  sayisalIdParam,
  hayvanIdParam,
  sahipTakipVeterinerUuidParam,
  sahipRandevuOlustur,
  sahipAiOnYonlendirme,
  sahipRandevuOneri,
  sahipRandevuIptal,
  veterinerRandevuIptal,
  veterinerRandevuNoShow,
  veterinerRandevuTamamla,
  veterinerRandevuDurumGuncelle,
  veterinerRandevuCheckout,
  veterinerRandevuIlerlet,
  veterinerHizliMesaj,
  veterinerMesajSablonOlustur,
  veterinerMesajSablonGuncelle,
  veterinerIletisimAyarGuncelle,
  veterinerIletisimAyarTest,
  mesajOdaOlustur,
  mesajOdaIdParam,
  mesajGonder,
  mesajDuzenle,
  mesajSil,
  bildirimTopluOkundu,
  sahipHayvanOlustur,
  sahipHayvanGuncelle,
  sahipKayitOl,
  veterinerHastaOlustur,
  veterinerSahipHizliOlustur,
  hayvanSil,
  saglikKaydiEkle,
  asiKaydiEkle,
  veterinerReceteOlustur,
  hayvanKimlikGuncelle,
  hayvanKimlikDosyaYukle,
  kimlikIletisimTalebi,
  kimlikKonumBildir,
  limitOnly,
  cihazFcmKayit,
  sahipProfilFotoYukle,
  veterinerProfilFotoYukle,
  veterinerProfilGuncelle,
};

