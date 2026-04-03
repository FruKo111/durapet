-- Yasal metinler (KVKK, gizlilik, açık rıza) — admin panelden güncellenir; API kamuya açık GET ile sunar.

create table if not exists public.yasal_metinler (
  anahtar text primary key,
  baslik text not null default '',
  icerik text not null default '',
  guncelleme_tarihi timestamptz not null default now()
);

create or replace function public.yasal_metinler_guncelleme_tarihi()
returns trigger language plpgsql as $$
begin
  new.guncelleme_tarihi = now();
  return new;
end;
$$;

drop trigger if exists trg_yasal_metinler_guncelleme on public.yasal_metinler;
create trigger trg_yasal_metinler_guncelleme
before update on public.yasal_metinler
for each row execute function public.yasal_metinler_guncelleme_tarihi();

insert into public.yasal_metinler (anahtar, baslik, icerik) values
(
  'kvkk_aydinlatma',
  '6698 sayılı KVKK kapsamında aydınlatma metni',
  $kvkk$Veri sorumlusu: DuraPet platformunu işleten tüzel kişi (iletişim bilgileri yönetim tarafından güncellenir).

İşlenen kişisel veriler: Kimlik/iletişim (ad, soyad, e-posta, telefon), hayvan sahipliği ve sağlık kayıtlarına ilişkin veriler, cihaz/oturum teknik kayıtları, güvenlik ve erişim logları.

Amaçlar: Hesap oluşturma ve kimlik doğrulama, randevu ve mesajlaşma hizmetleri, dijital hayvan kimliği ve QR doğrulama, yasal yükümlülükler, hizmet güvenliği ve iyileştirme.

Hukuki sebepler: Sözleşmenin ifası, meşru menfaat, açık rıza (varsa), hukuki yükümlülük.

Aktarım: Hizmet sağlayıcıları (barındırma, bildirim, iletişim kanalları) ile KVKK’ya uygun sözleşmeler çerçevesinde; yurt dışına aktarım varsa ayrıca bilgilendirilirsiniz.

Haklarınız: Verilerinize erişim, düzeltme, silme, işlemeyi kısıtlama/itiraz, veri taşınabilirliği ve KVKK m.11 kapsamındaki başvuru hakkı. Başvurularınızı veri sorumlusunun iletişim kanalları üzerinden iletebilirsiniz.

Bu metin örnektir; hukuki danışmanlık ile güncellenmelidir.$kvkk$
),
(
  'gizlilik_politikasi',
  'Gizlilik politikası',
  $giz$Bu politika, DuraPet mobil ve web uygulamalarında kişisel verilerin nasıl toplandığını, kullanıldığını ve korunduğunu özetler.

Toplama: Kayıt formları, hizmet kullanımı sırasında oluşan kayıtlar, destek talepleri ve teknik loglar.

Çerezler / benzeri teknolojiler: Oturum ve tercih yönetimi için kullanılabilir; ayrıntılar için çerez bildirimi yayımlanabilir.

Saklama süreleri: Hizmet süresi ve yasal zamanaşımı süreleriyle orantılı olarak; amaç sona erdiğinde silme veya anonimleştirme uygulanır.

Güvenlik: Erişim kontrolleri, şifreleme (uygun olduğu ölçüde), denetim kayıtları.

Üçüncü taraflar: Yalnızca hizmetin gerektirdiği ölçüde ve veri işleme sözleşmeleriyle.

Haklarınız ve iletişim: KVKK aydınlatma metninde belirtilen haklar geçerlidir. Bu metin örnektir.$giz$
),
(
  'acik_riza_metni',
  'Açık rıza metni',
  $riza$Aşağıdaki işlemler için kişisel verilerimin işlenmesine açık rıza veriyorum:

• Pazarlama iletişimi (e-posta / SMS / push bildirim) ile kampanya ve bilgilendirmelerin gönderilmesi (isteğe bağlı; işaretlenmezse bu kapsamda ileti gönderilmez).

• Hayvan sağlığı ve kimlik verilerimin, hizmetin sunulması için veteriner ve yetkili klinik kullanıcılarıyla paylaşılması.

Rızamı dilediğim zaman geri çekebileceğim tarafıma bildirilir. Geri çekme, geri çekmeden önce hukuka uygun işlenmiş verileri etkilemez.

Bu metin örnektir; hukuki danışmanlık ile güncellenmelidir.$riza$
)
on conflict (anahtar) do nothing;

alter table public.kullanicilar
  add column if not exists kvkk_acik_riza_onay boolean not null default false,
  add column if not exists kvkk_acik_riza_tarihi timestamptz,
  add column if not exists pazarlama_riza_izni boolean not null default false;

comment on column public.kullanicilar.kvkk_acik_riza_onay is 'Kayıtta zorunlu aydınlatma + acik_riza_metni onayı';
comment on column public.kullanicilar.kvkk_acik_riza_tarihi is 'Onay zamanı';
comment on column public.kullanicilar.pazarlama_riza_izni is 'İsteğe bağlı pazarlama iletişimi';
