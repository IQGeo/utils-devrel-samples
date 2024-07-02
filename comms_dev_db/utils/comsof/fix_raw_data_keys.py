# Fix up external names of comsof raw data features
from myworldapp.core.server.dd.myw_field_descriptor import MywFieldDescriptor

dd = db.dd

for ft in dd.featureTypes('myworld','out*'):
    ft_rec = dd.featureTypeRec('myworld',ft)
    ft_desc = dd.featureTypeDescriptor(ft_rec)
    
    print(ft,ft_desc.key_field,ft_desc.key_field.generator)
    
    if ft_desc.key_field.generator != 'sequence':
        ft_desc.key_field.key = False
        ft_desc.fields['sys_id'] = MywFieldDescriptor('sys_id','integer',key=True,generator='sequence')
        
        db.tables[ft].truncate()
        dd.dropFeatureType(ft_rec)
        dd.createFeatureType(ft_desc)
