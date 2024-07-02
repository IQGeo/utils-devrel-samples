# Fix up external names of comsof raw data features
from myworldapp.core.server.dd.myw_field_descriptor import MywFieldDescriptor

dd = db.dd

for ft in dd.featureTypes('myworld','out*'):
    ft_rec = dd.featureTypeRec('myworld',ft)
    ft_desc = dd.featureTypeDescriptor(ft_rec)
    
    ft_desc.external_name = ft_desc.external_name.replace('Out','')
    ft_desc.external_name = ft_desc.external_name.replace('pieces',' Pieces')
    ft_desc.external_name = ft_desc.external_name.replace('duct',' Duct')
    ft_desc.external_name = ft_desc.external_name.replace('clusters',' Clusters')
    ft_desc.external_name = ft_desc.external_name.replace('points',' Points')
    ft_desc.external_name = ft_desc.external_name.replace('cable',' Cable')
    ft_desc.external_name = ft_desc.external_name.replace('routes',' Routes')
    ft_desc.external_name = ft_desc.external_name.replace('detail',' Detail')
    ft_desc.external_name = ft_desc.external_name.replace('entries',' Entry')
    ft_desc.external_name = ft_desc.external_name.replace('slack',' Slack')
    ft_desc.external_name = ft_desc.external_name.replace('equipment',' Equipment')
    ft_desc.external_name = ft_desc.external_name.replace('structure',' Structure')
    ft_desc.external_name = ft_desc.external_name.replace('segment',' Segment')

    if ft_desc.external_name.endswith('s'):
        ft_desc.external_name = ft_desc.external_name[:-1]

    id_field_name = ft_desc.key_field_name
    if 'eq_id' in ft_desc.fields:
        id_field_name = 'eq_id'
    ft_desc.title = "{}: [{}]".format('{display_name}',id_field_name)
   
    print(ft,ft_desc.external_name)
    dd.alterFeatureType(ftr_rec,ft_desc)
 
