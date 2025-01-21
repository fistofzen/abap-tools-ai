CLASS zcl_your_service_test DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC
  FOR TESTING.

  PUBLIC SECTION.
    METHODS: test_service FOR TESTING.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_your_service_test IMPLEMENTATION.
  METHOD test_service.
    DATA(lo_http_client) = cl_web_http_client_manager=>create_by_http_destination(
      i_destination = 'YOUR_RFC_DESTINATION'
    ).
    
    DATA(lo_request) = lo_http_client->get_http_request( ).
    lo_request->set_header_field(
      i_name = 'Accept'
      i_value = 'application/xml'
    ).
    
    DATA(lo_response) = lo_http_client->execute( 
      i_method = if_web_http_client=>get
    ).
    
    cl_abap_unit_assert=>assert_equals(
      act = lo_response->get_status( )
      exp = 200
    ).
  ENDMETHOD.
ENDCLASS. 