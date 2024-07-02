# Additional settings for TMF
# pylint: disable=undefined-variable


tmf_fields  = db.setting("mywcom.tmf_fields")

tmf_fields["Address"] = {
    "streetNr" : "street_number",
    "streetName" : "street_name",
    "postcode" : "postcode",
    "city" : "city"
}



db.setSetting("mywcom.tmf_fields", tmf_fields)