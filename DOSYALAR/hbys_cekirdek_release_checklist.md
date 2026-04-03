# HBYS Çekirdek Release Checklist

## 1) Klinik Akış Kuralları
- [ ] Geçiş akışı doğrulandı: `beklemede -> onaylandi -> geldi -> muayenede -> tamamlandi`
- [ ] Ayrık akışlar doğrulandı: `iptal`, `no_show`
- [ ] `tamamla` sonrası muayene özeti (SOAP + triage + vital) sağlık geçmişine yansıyor
- [ ] `checkout` yalnızca `tamamlandi` durumunda çalışıyor

## 2) Veteriner Ekranı
- [ ] Randevu kartında eksik klinik alan uyarıları görünüyor
- [ ] Tamamlama ekranı şablonları çalışıyor
- [ ] Yaklaşan takip kontrolleri listesi 7 gün penceresinde doğru hesaplanıyor

## 3) Sahip Ekranı
- [ ] Sağlık geçmişi tablosunda triage etiketi ve vital özet görünüyor
- [ ] Sağlık detay drawer'ında SOAP/vital alanları okunabilir
- [ ] Önceki/sonraki kayıt geçişleri doğru çalışıyor

## 4) Audit ve İzlenebilirlik
- [ ] Erişim loglarında klinik eylemler oluşuyor:
  - `veteriner_randevu_tamamlama`
  - `veteriner_randevu_checkout`
  - `veteriner_randevu_no_show`
- [ ] Admin erişim logları ekranında kayıtlar okunabiliyor

## 5) Test ve Doğrulama
- [ ] `npm run lint` (`web`) temiz
- [ ] `npm run test:api-smoke` başarılı
- [ ] `npm run test:api-smoke:auth` başarılı

## 6) Yayın Onayı
- [ ] Kritik akışlarda bloklayıcı hata yok
- [ ] Türkçe terminoloji tutarlı
- [ ] Dokümantasyon güncel
