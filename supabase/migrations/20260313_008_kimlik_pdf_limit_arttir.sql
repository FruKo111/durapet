-- Kimlik PDF bucket boyut limitini artir

update storage.buckets
set file_size_limit = 20971520
where id = 'hayvan-kimlik-pdf';
    